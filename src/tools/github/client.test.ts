import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GithubClient, GithubRateLimitError, GithubNotFoundError, GithubError } from "./client.js";

describe("GithubClient", () => {
  let client: GithubClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new GithubClient("fake-token");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
      json: () => Promise.resolve(body),
    });
  }

  describe("listContents", () => {
    it("returns an array of entries for a directory", async () => {
      const body = [
        { name: "src", path: "src", type: "dir", size: 0 },
        { name: "README.md", path: "README.md", type: "file", size: 1234 },
      ];
      mockResponse(200, body);

      const result = await client.listContents("vitejs", "vite", "/");
      expect(Array.isArray(result)).toBe(true);
      expect((result as { name: string }[])[0].name).toBe("src");
    });

    it("returns a single object when the path is a file", async () => {
      const body = {
        name: "README.md",
        path: "README.md",
        type: "file",
        size: 100,
        content: "aGVsbG8=",
        encoding: "base64",
      };
      mockResponse(200, body);

      const result = await client.listContents("vitejs", "vite", "README.md");
      expect(Array.isArray(result)).toBe(false);
      expect((result as { name: string }).name).toBe("README.md");
    });

    it("sends Authorization header when token is present", async () => {
      mockResponse(200, []);
      await client.listContents("vitejs", "vite", "/");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
    });

    it("includes User-Agent header (required by GitHub)", async () => {
      mockResponse(200, []);
      await client.listContents("vitejs", "vite", "/");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)["User-Agent"]).toBe("mcp-web-tools");
    });

    it("throws GithubNotFoundError on 404", async () => {
      mockResponse(404, { message: "Not Found" });
      await expect(client.listContents("foo", "bar", "/")).rejects.toBeInstanceOf(GithubNotFoundError);
    });

    it("throws GithubRateLimitError on 403 with x-ratelimit-remaining: 0", async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
      mockResponse(
        403,
        { message: "rate limit exceeded" },
        {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetEpoch),
        },
      );

      const err = await client.listContents("foo", "bar", "/").catch((e) => e);
      expect(err).toBeInstanceOf(GithubRateLimitError);
      expect((err as GithubRateLimitError).message).toContain("GITHUB_TOKEN");
      expect((err as GithubRateLimitError).message).toContain("5000 requests/hour");
    });

    it("treats 403 without rate-limit header as a generic error", async () => {
      mockResponse(403, { message: "forbidden for other reasons" });
      await expect(client.listContents("foo", "bar", "/")).rejects.toBeInstanceOf(GithubError);
    });
  });

  describe("readFile", () => {
    it("returns file content object when path is a file", async () => {
      const body = { name: "file.ts", path: "file.ts", type: "file", size: 5, content: "aGVsbG8=", encoding: "base64" };
      mockResponse(200, body);

      const result = await client.readFile("vitejs", "vite", "file.ts");
      expect(result.name).toBe("file.ts");
      expect(result.content).toBe("aGVsbG8=");
    });

    it("throws when the path resolves to a directory", async () => {
      mockResponse(200, [{ name: "a", path: "a", type: "file", size: 0 }]);
      const err = await client.readFile("vitejs", "vite", "src").catch((e) => e);
      expect(err).toBeInstanceOf(GithubError);
      expect((err as GithubError).message).toContain("directory");
    });
  });

  describe("anonymous client (no token)", () => {
    it("does not send Authorization header", async () => {
      const anonClient = new GithubClient();
      mockResponse(200, []);
      await anonClient.listContents("vitejs", "vite", "/");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });
  });
});
