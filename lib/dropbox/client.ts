// Dropbox integration for SG Brand Hub.
//
// Uses the official Dropbox SDK with refresh-token auth — the SDK fetches a
// short-lived access token on demand using DROPBOX_APP_KEY + APP_SECRET +
// REFRESH_TOKEN. The refresh token doesn't expire unless revoked, so this
// integration is permanent after setup.

import { Dropbox } from "dropbox";

// SG's client folders live under "/NN x SG/" in the team Dropbox.
// Override via env var if the path ever changes.
const CLIENTS_ROOT = process.env.DROPBOX_ROOT_PATH || "/NN x SG";

// Per-client folder tree (relative to /NN x SG/[Business Name]/).
// Matches the existing convention seen in clients like AER Tampa:
//   [Client]/
//     {currentYear}/
//     Assets/
//       Logo/
//       Deliverables/
// Year folder uses the year at creation time; AM can add future years
// manually when needed.
function subfoldersForClient(): string[] {
  const year = new Date().getFullYear();
  return [
    String(year),
    "Assets",
    "Assets/Logo",
    "Assets/Deliverables",
  ];
}

function getClient(): Dropbox {
  const clientId = process.env.DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Dropbox env vars missing — need DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN"
    );
  }

  return new Dropbox({
    clientId,
    clientSecret,
    refreshToken,
    fetch: globalThis.fetch as unknown as typeof fetch,
  });
}

// Filesystem-safe brand name. Dropbox allows most characters but we strip
// things that confuse paths or look bad in folder lists.
function safeName(name: string): string {
  return name
    .trim()
    .replace(/[\\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "Unnamed";
}

/**
 * Idempotent: creates /NN x SG/[Business Name]/ and the full subfolder tree.
 * Returns a shareable Dropbox URL for the parent folder.
 *
 * If the folder tree already exists (created previously), this still returns
 * the shareable URL — Dropbox's "create shared link" call returns the
 * existing link if there is one.
 */
export async function ensureBrandFolderTree(businessName: string): Promise<{
  parentPath: string;
  shareUrl: string;
}> {
  const dbx = getClient();
  const folder = safeName(businessName);
  const parentPath = `${CLIENTS_ROOT}/${folder}`;

  // Build the full list of paths in creation order: the client parent first,
  // then all the subfolders (sorted by depth so parents come before children).
  //
  // We DON'T try to create CLIENTS_ROOT itself — `/NN x SG` is a team folder
  // mount that already exists at the top of the team Dropbox, and trying to
  // create it via filesCreateFolderV2 returns a 400 (not a normal path/conflict).
  const allPaths = [
    parentPath,
    ...subfoldersForClient().map((sub) => `${parentPath}/${sub}`),
  ];

  // Create one at a time in order. create_folder_batch turned out to be
  // finicky with scopes/path-conflict handling — the one-at-a-time approach
  // is slightly slower (~10 sequential requests) but works reliably and lets
  // us cleanly distinguish "already exists" from real errors.
  for (const path of allPaths) {
    try {
      await dbx.filesCreateFolderV2({ path, autorename: false });
    } catch (innerErr: unknown) {
      const errObj = innerErr as {
        error?: { error_summary?: string; error?: { ".tag"?: string } };
        message?: string;
      };
      const summary =
        errObj.error?.error_summary ?? errObj.message ?? String(innerErr);
      // "path/conflict/folder" means the folder already exists — that's fine.
      if (/path\/conflict|already_exists|path_conflict/i.test(summary)) continue;
      throw new Error(`Folder create failed for "${path}": ${summary}`);
    }
  }

  // Get or create a shareable URL for the parent folder. If a shared link
  // already exists, Dropbox 409s — in that case fetch the existing one.
  let shareUrl: string;
  try {
    const linkRes = await dbx.sharingCreateSharedLinkWithSettings({
      path: parentPath,
    });
    shareUrl = linkRes.result.url;
  } catch (e: unknown) {
    const errObj = e as {
      error?: { error_summary?: string };
      message?: string;
    };
    const summary = errObj.error?.error_summary ?? errObj.message ?? String(e);
    // Look up the existing link instead.
    try {
      const existing = await dbx.sharingListSharedLinks({
        path: parentPath,
        direct_only: true,
      });
      const link = existing.result.links[0];
      if (!link) throw new Error(`Couldn't create or find shared link: ${summary}`);
      shareUrl = link.url;
    } catch (innerErr) {
      const innerSummary =
        (innerErr as { error?: { error_summary?: string }; message?: string }).error
          ?.error_summary ??
        (innerErr as { message?: string }).message ??
        String(innerErr);
      throw new Error(
        `Shared link creation failed: ${summary}. Fallback list failed: ${innerSummary}`
      );
    }
  }

  return { parentPath, shareUrl };
}
