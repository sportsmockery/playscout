/**
 * Deterministic storage object path for a new upload. Keeps team scoping and
 * avoids collisions without a server round trip. Pure (no native imports) so
 * the resume-safety contract is unit-testable: the same upload id + file always
 * maps to the same object, which is what stops retries creating duplicates.
 */
export function makeStoragePath(teamId: string, uploadId: string, fileName: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? 'mp4';
  return `${teamId}/${uploadId}.${ext}`;
}
