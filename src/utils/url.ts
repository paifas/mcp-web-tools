/** Syntax/credential validation only; this is not an SSRF or DNS policy. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && !url.username && !url.password;
  } catch {
    return false;
  }
}
