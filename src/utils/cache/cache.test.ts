import { describe, it, expect, vi, beforeEach } from "vitest";
import { cacheKey, cacheGet, cacheSet, cacheConfigure, cacheReset } from "./index.js";

describe("cacheKey", () => {
  it("produces deterministic keys for same params", () => {
    const params = { query: "test", depth: "basic" };
    expect(cacheKey("search", params)).toBe(cacheKey("search", params));
  });

  it("produces different keys for different params", () => {
    const a = { query: "test", depth: "basic" };
    const b = { query: "test", depth: "advanced" };
    expect(cacheKey("search", a)).not.toBe(cacheKey("search", b));
  });

  it("produces different keys for different prefixes", () => {
    const params = { query: "test" };
    expect(cacheKey("search", params)).not.toBe(cacheKey("extract", params));
  });

  it("produces same key regardless of top-level key order", () => {
    const a = { query: "x", depth: "basic" };
    const b = { depth: "basic", query: "x" };
    expect(cacheKey("search", a)).toBe(cacheKey("search", b));
  });

  it("produces same key regardless of nested key order", () => {
    const a = { filters: { b: 2, a: 1 }, query: "x" };
    const b = { query: "x", filters: { a: 1, b: 2 } };
    expect(cacheKey("search", a)).toBe(cacheKey("search", b));
  });

  it("preserves array order (does not sort arrays)", () => {
    const a = { urls: ["x", "y"] };
    const b = { urls: ["y", "x"] };
    expect(cacheKey("extract", a)).not.toBe(cacheKey("extract", b));
  });
});

describe("cacheGet / cacheSet", () => {
  beforeEach(() => {
    cacheReset();
  });

  it("returns stored data", () => {
    cacheSet("key1", { hello: "world" }, 60);
    expect(cacheGet("key1")).toEqual({ hello: "world" });
  });

  it("returns undefined on miss", () => {
    expect(cacheGet("nonexistent")).toBeUndefined();
  });

  it("returns undefined after TTL expires", () => {
    vi.useFakeTimers();
    cacheSet("key2", "data", 5);
    vi.advanceTimersByTime(6000);
    expect(cacheGet("key2")).toBeUndefined();
    vi.useRealTimers();
  });

  it("does not store when ttl is 0", () => {
    cacheSet("key3", "data", 0);
    expect(cacheGet("key3")).toBeUndefined();
  });
});

describe("LRU eviction", () => {
  beforeEach(() => {
    cacheReset();
    cacheConfigure({ maxEntries: 3 });
  });

  it("evicts the least-recently-used entry when capacity is exceeded", () => {
    cacheSet("a", 1, 60);
    cacheSet("b", 2, 60);
    cacheSet("c", 3, 60);
    // Touch "a" so "b" becomes LRU
    expect(cacheGet("a")).toBe(1);
    cacheSet("d", 4, 60);

    expect(cacheGet("a")).toBe(1); // still present (recently used)
    expect(cacheGet("b")).toBeUndefined(); // evicted as LRU
    expect(cacheGet("c")).toBe(3);
    expect(cacheGet("d")).toBe(4);
  });

  it("evicts oldest when no reads happened (insertion-order LRU)", () => {
    cacheSet("a", 1, 60);
    cacheSet("b", 2, 60);
    cacheSet("c", 3, 60);
    cacheSet("d", 4, 60); // evicts "a"

    expect(cacheGet("a")).toBeUndefined();
    expect(cacheGet("b")).toBe(2);
  });

  it("overwriting an existing key updates its recency without growing size", () => {
    cacheSet("a", 1, 60);
    cacheSet("b", 2, 60);
    cacheSet("c", 3, 60);
    cacheSet("a", 11, 60); // "a" becomes most recent; no eviction
    cacheSet("d", 4, 60); // evicts "b" (now LRU)

    expect(cacheGet("a")).toBe(11);
    expect(cacheGet("b")).toBeUndefined();
    expect(cacheGet("c")).toBe(3);
    expect(cacheGet("d")).toBe(4);
  });

  it("maxEntries = 0 disables caching entirely", () => {
    cacheConfigure({ maxEntries: 0 });
    cacheSet("a", 1, 60);
    expect(cacheGet("a")).toBeUndefined();
  });
});

describe("periodic sweep", () => {
  beforeEach(() => {
    cacheReset();
  });

  it("drops expired entries when the sweep interval fires", () => {
    vi.useFakeTimers();
    cacheConfigure({ sweepIntervalMs: 1000 });

    cacheSet("fresh", "v", 60);
    cacheSet("stale", "v", 1);

    // Before sweep window, stale entry still readable on miss-check only via get.
    // Advance past the TTL of "stale" but trigger the sweep too.
    vi.advanceTimersByTime(1100);

    // Sweep should have run at 1000ms; stale entry's TTL (1s) had elapsed by then.
    expect(cacheGet("fresh")).toBe("v");
    expect(cacheGet("stale")).toBeUndefined();
    vi.useRealTimers();
  });

  it("sweepIntervalMs = 0 disables the periodic sweep", () => {
    vi.useFakeTimers();
    cacheConfigure({ sweepIntervalMs: 0 });

    cacheSet("stale", "v", 1);
    vi.advanceTimersByTime(10_000);

    // No sweep ran, but lazy expiry on get still works.
    expect(cacheGet("stale")).toBeUndefined();
    vi.useRealTimers();
  });
});
