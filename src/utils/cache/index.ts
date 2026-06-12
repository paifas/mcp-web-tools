const store = new Map<string, { data: unknown; expires: number }>();

/** Serialize params with sorted keys for deterministic cache keys. */
export function cacheKey(prefix: string, params: unknown): string {
  const sorted = JSON.stringify(params, Object.keys(params as object).sort());
  return `${prefix}:${sorted}`;
}

/** Get a cached value. Returns undefined on miss or if expired. */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/** Store a value with the given TTL in seconds. */
export function cacheSet(key: string, data: unknown, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return;
  store.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
}
