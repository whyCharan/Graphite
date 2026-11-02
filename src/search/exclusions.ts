/**
 * Folder exclusion (US-11). Excluded folders are never indexed, never searched
 * and never sent, so this filter runs before a note reaches the index rather
 * than filtering results afterwards.
 */

/** Strips surrounding slashes and whitespace so "/Private/" and "Private" mean the same folder. */
function normaliseFolder(folder: string): string {
  return folder.trim().replace(/^[/\\]+|[/\\]+$/g, "").replace(/\\/g, "/");
}

/**
 * Parses the excluded-folders setting. Accepts one folder per line or a comma
 * separated list, because both are natural to type into a settings field.
 */
export function parseExcludedFolders(raw: string): string[] {
  const folders = raw
    .split(/[\n,]/)
    .map(normaliseFolder)
    .filter((folder) => folder.length > 0);
  return [...new Set(folders)];
}

/**
 * True when a note sits in an excluded folder or one of its descendants.
 *
 * Compared case-insensitively: a user who types "private" should not be caught
 * out by a folder named "Private".
 */
export function isExcluded(notePath: string, excludedFolders: readonly string[]): boolean {
  if (excludedFolders.length === 0) return false;
  const path = notePath.replace(/\\/g, "/").toLowerCase();
  for (const folder of excludedFolders) {
    const prefix = normaliseFolder(folder).toLowerCase();
    if (!prefix) continue;
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
