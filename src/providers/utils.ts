/**
 * Return true if `url`'s hostname equals or is a subdomain of any entry in
 * `domains`. Entries may be bare hosts ("example.com") or include a scheme;
 * leading `www.` is tolerated on both sides.
 */
export function matchesDomain(url: string, domains: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return domains.some((d) => {
    const target = d
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    return host === target || host.endsWith(`.${target}`);
  });
}

/** Split `arr` into chunks of size `n`. */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
