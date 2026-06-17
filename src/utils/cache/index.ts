/**
 * Process-local LRU cache with TTL.
 *
 * - Bounded by maxEntries (default 100). When exceeded, the least-recently-used
 *   entry is evicted. LRU order is maintained via Map insertion order: reads
 *   delete + re-insert to mark recency.
 * - A periodic sweep (default every 5 minutes, unref'd) drops expired entries
 *   so a long-lived MCP session doesn't accumulate stale data between reads.
 * - Cache keys are produced via deep-stable JSON serialization, so callers
 *   don't need to pre-sort nested params.
 *
 * This cache is intentionally per-process and not synchronized across
 * instances — MCP servers are typically single-handle stdio processes.
 */

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface Entry {
  data: unknown;
  expires: number;
}

const store = new Map<string, Entry>();
let maxEntries = DEFAULT_MAX_ENTRIES;
let sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS;
let sweepTimer: ReturnType<typeof setInterval> | undefined;

export interface CacheOptions {
  maxEntries?: number;
  /** Sweep interval in milliseconds. 0 disables periodic sweep. */
  sweepIntervalMs?: number;
}

/** Reconfigure bounds and sweep cadence. Safe to call multiple times. */
export function cacheConfigure(opts: CacheOptions): void {
  if (opts.maxEntries !== undefined) {
    if (!Number.isInteger(opts.maxEntries) || opts.maxEntries < 0) {
      throw new Error(`maxEntries must be a non-negative integer, got ${opts.maxEntries}`);
    }
    maxEntries = opts.maxEntries;
    evictIfNeeded();
  }
  if (opts.sweepIntervalMs !== undefined) {
    if (!Number.isInteger(opts.sweepIntervalMs) || opts.sweepIntervalMs < 0) {
      throw new Error(`sweepIntervalMs must be a non-negative integer, got ${opts.sweepIntervalMs}`);
    }
    sweepIntervalMs = opts.sweepIntervalMs;
    restartSweepTimer();
  }
}

/** Clear the cache and reset bounds/interval to defaults. Intended for tests. */
export function cacheReset(): void {
  store.clear();
  maxEntries = DEFAULT_MAX_ENTRIES;
  sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS;
  restartSweepTimer();
}

/** Stable JSON serialization: object keys sorted at every depth, arrays preserved in order. */
function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = stableNormalize(obj[k]);
    }
    return out;
  }
  return value;
}

/** Build a deterministic cache key for a given prefix + params shape. */
export function cacheKey(prefix: string, params: unknown): string {
  return `${prefix}:${stableStringify(params)}`;
}

/** Get a cached value. Returns undefined on miss or if expired. Touches LRU recency. */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  // Mark as recently used: delete + re-insert moves it to the end of iteration order.
  store.delete(key);
  store.set(key, entry);
  return entry.data as T;
}

/** Store a value with the given TTL in seconds. ttl <= 0 is a no-op (cache disabled). */
export function cacheSet(key: string, data: unknown, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return;
  // Delete first so re-inserts move to end of iteration order (most-recent).
  if (store.has(key)) store.delete(key);
  store.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
  evictIfNeeded();
}

function evictIfNeeded(): void {
  while (store.size > maxEntries) {
    // Map.keys() iterates in insertion order; first key is least-recently-used.
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

function sweep(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expires) {
      store.delete(key);
    }
  }
}

function restartSweepTimer(): void {
  if (sweepTimer !== undefined) {
    clearInterval(sweepTimer);
    sweepTimer = undefined;
  }
  if (sweepIntervalMs > 0) {
    sweepTimer = setInterval(sweep, sweepIntervalMs);
    // Don't keep the Node process alive solely for cache sweeping.
    if (typeof sweepTimer.unref === "function") {
      sweepTimer.unref();
    }
  }
}

// Start the sweep timer on first module load.
restartSweepTimer();
