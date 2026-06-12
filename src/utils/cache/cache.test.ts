import { describe, it, expect, vi, beforeEach } from "vitest";
import { cacheKey, cacheGet, cacheSet } from "./index.js";

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
});

describe("cacheGet / cacheSet", () => {
  beforeEach(() => {
    // Clear the module-level store by importing fresh -- since it's a module-level Map,
    // we test behavior, not internal state
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
