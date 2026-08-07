// Strips characters that could break out of a quoted Content-Disposition
// header value or traverse a path, and caps length. This is a defensive
// display-name sanitizer only — the actual storage path is always the
// server-generated attachmentRef.id, never this value, so a maximally
// aggressive strip here has no functional downside.
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately stripping control chars, including the ones this regex needs to name
  const stripped = name.replace(/[\x00-\x1f\x7f"/\\]/g, '')
  return stripped.slice(0, 255)
}
