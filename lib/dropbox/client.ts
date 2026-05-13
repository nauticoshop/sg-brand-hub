// Dropbox integration for SG Brand Hub.
//
// Uses the official Dropbox SDK with refresh-token auth — the SDK fetches a
// short-lived access token on demand using DROPBOX_APP_KEY + APP_SECRET +
// REFRESH_TOKEN. The refresh token doesn't expire unless revoked, so this
// integration is permanent after setup.

import { Dropbox } from "dropbox";

const CLIENTS_ROOT = process.env.DROPBOX_ROOT_PATH || "/Clients";

// Per-brand folder tree (relative to /Clients/[Business Name]/).
const SUBFOLDERS = [
  "01_Brand Assets",
  "01_Brand Assets/Logos",
  "01_Brand Assets/Fonts",
  "01_Brand Assets/Photos",
  "01_Brand Assets/Inspiration",
  "02_Video Assets",
  "02_Video Assets/Intros & Outros - Social Vertical",
  "02_Video Assets/Intros & Outros - Horizontal",
  "02_Video Assets/Lower Thirds - Social",
  "02_Video Assets/Lower Thirds - Horizontal",
  "03_Active Projects",
  "04_Delivered",
] as const;

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
 * Idempotent: creates /Clients/[Business Name]/ and the full subfolder tree.
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

  // Build the full list of paths we want to ensure exist.
  const allPaths = [parentPath, ...SUBFOLDERS.map((sub) => `${parentPath}/${sub}`)];

  // create_folder_batch accepts up to 1000 paths and is idempotent if
  // autorename:false + we ignore the "path/conflict" error.
  try {
    await dbx.filesCreateFolderBatch({
      paths: allPaths,
      autorename: false,
      force_async: false,
    });
  } catch (e) {
    // Dropbox returns 409 / path_conflict if a folder already exists. The
    // batch API generally tolerates conflicts within the batch, but if the
    // whole call fails, fall back to creating one at a time and skipping
    // conflicts.
    for (const path of allPaths) {
      try {
        await dbx.filesCreateFolderV2({ path, autorename: false });
      } catch (innerErr) {
        const msg = (innerErr as Error).message ?? "";
        if (!/path\/conflict|already_exists/i.test(msg)) {
          // Anything other than "already exists" is a real failure.
          throw innerErr;
        }
      }
    }
  }

  // Get or create a shareable URL for the parent folder. If a shared link
  // already exists, Dropbox returns 409 with the existing link in the error
  // — we extract it.
  let shareUrl: string;
  try {
    // Use the team's default sharing policy (no explicit settings — the SDK
    // types are strict about enum values so we just omit them).
    const linkRes = await dbx.sharingCreateSharedLinkWithSettings({
      path: parentPath,
    });
    shareUrl = linkRes.result.url;
  } catch (e) {
    // Try fetching existing shared links instead.
    try {
      const existing = await dbx.sharingListSharedLinks({ path: parentPath, direct_only: true });
      const link = existing.result.links[0];
      if (!link) throw e;
      shareUrl = link.url;
    } catch {
      throw e;
    }
  }

  return { parentPath, shareUrl };
}
