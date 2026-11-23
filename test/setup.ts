import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected network request in a unit test. Mock fetch or inject a fixture provider.");
    }),
  );
});
