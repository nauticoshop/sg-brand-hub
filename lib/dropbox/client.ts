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

function getClientConfig() {
  const clientId = process.env.DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Dropbox env vars missing — need DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN"
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    fetch: globalThis.fetch as unknown as typeof fetch,
  };
}

function getClient(): Dropbox {
  return new Dropbox(getClientConfig());
}

/**
 * Return a Dropbox client whose path-root is set to the team's root namespace.
 *
 * Why this exists: SG's client folders live in `/NN x SG`, which is a Dropbox
 * team folder mounted into the OAuth user's personal namespace. The default
 * namespace for a user-token call is the personal one, where `/NN x SG` is
 * just a "shared mount" link — writing into it (creating subfolders) returns
 * a 400. To actually write inside team folders, the API call has to specify
 * the team's root namespace via the `Dropbox-API-Path-Root` header.
 *
 * We discover the right namespace ID by calling `users/get_current_account`,
 * which returns the user's `root_info.root_namespace_id` (the team's root for
 * team members; the user's personal namespace for solo accounts).
 */
async function getRootedClient(): Promise<Dropbox> {
  const config = getClientConfig();

  // Allow the team root namespace to be provided directly via env var as an
  // escape hatch — if the Dropbox app's OAuth scopes don't include
  // `account_info.read`, the discovery call below will fail.
  const explicitRoot = process.env.DROPBOX_TEAM_NAMESPACE_ID;
  if (explicitRoot) {
    return new Dropbox({
      ...config,
      pathRoot: JSON.stringify({ ".tag": "root", root: explicitRoot }),
    });
  }

  const probe = new Dropbox(config);
  let rootNamespaceId: string;
  try {
    const account = await probe.usersGetCurrentAccount();
    rootNamespaceId = account.result.root_info.root_namespace_id;
  } catch (err: unknown) {
    const errObj = err as {
      error?: { error_summary?: string };
      status?: number;
      message?: string;
    };
    const summary = errObj.error?.error_summary ?? errObj.message ?? String(err);
    throw new Error(
      `Failed to fetch account info (probe call): ${summary}. ` +
        `If this is a scope issue, add account_info.read to the Dropbox app and re-OAuth, ` +
        `or set DROPBOX_TEAM_NAMESPACE_ID to skip discovery.`
    );
  }
  return new Dropbox({
    ...config,
    pathRoot: JSON.stringify({ ".tag": "root", root: rootNamespaceId }),
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
  // Use a path-rooted client so writes land inside the team folder namespace,
  // not the user's personal namespace.
  const dbx = await getRootedClient();
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
        error?: unknown;
        status?: number;
        message?: string;
      };
      // Pull out as much detail as Dropbox returned: error_summary if present,
      // otherwise the raw error body JSON, otherwise the message.
      const errAny = errObj.error as
        | { error_summary?: string; error?: unknown; user_message?: { text?: string } }
        | string
        | undefined;
      let summary: string;
      if (typeof errAny === "string") {
        summary = errAny;
      } else if (errAny && typeof errAny === "object") {
        summary =
          errAny.error_summary ??
          errAny.user_message?.text ??
          JSON.stringify(errAny).slice(0, 500);
      } else {
        summary = errObj.message ?? String(innerErr);
      }
      // "path/conflict/folder" means the folder already exists — that's fine.
      if (/path\/conflict|already_exists|path_conflict/i.test(summary)) continue;
      throw new Error(
        `Folder create failed for "${path}" (HTTP ${errObj.status ?? "?"}): ${summary}`
      );
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
