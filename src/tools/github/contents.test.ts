import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadFileTool } from "./read-file/index.js";
import { registerGetRepoStructureTool } from "./get-repo-structure/index.js";

type Handler = (params: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function captureTool(register: typeof registerReadFileTool) {
  const tool = vi.fn();
  register(
    { tool } as unknown as McpServer,
    { githubToken: "fake-token" } as Parameters<typeof registerReadFileTool>[1],
  );
  const [name, , schema, handler] = tool.mock.calls[0] as [string, string, Record<string, unknown>, Handler];
  return { name, schema, handler };
}

function fileResponse(overrides: Record<string, unknown> = {}) {
  return {
    name: "README.md",
    path: "README.md",
    type: "file",
    size: 5,
    encoding: "base64",
    content: Buffer.from("hello").toString("base64"),
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockRejectedValue(new Error("Unexpected mocked GitHub request"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockResponse(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe("github_read_file handler", () => {
  it("decodes multiline base64 UTF-8 content and includes the requested ref", async () => {
    const { name, schema, handler } = captureTool(registerReadFileTool);
    const content = "# Café\nHello world!\n";
    mockResponse(
      fileResponse({
        size: Buffer.byteLength(content),
        content: Buffer.from(content)
          .toString("base64")
          .match(/.{1,8}/g)!
          .join("\n"),
      }),
    );

    const out = await handler({ repo: "o/r", path: "docs/README.md", ref: "feature/docs" });

    expect(name).toBe("github_read_file");
    expect(Object.keys(schema)).toEqual(["repo", "path", "ref"]);
    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toContain("## o/r/docs/README.md @ feature/docs");
    expect(out.content[0].text).toContain(`\`\`\`\n${content}\n\`\`\``);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/o/r/contents/docs/README.md?ref=feature%2Fdocs",
    );
  });

  it.each(["none", "base64", undefined])("checks oversized files before handling %s encoding", async (encoding) => {
    const { handler } = captureTool(registerReadFileTool);
    mockResponse(fileResponse({ size: 2 * 1024 * 1024, encoding, content: "" }));

    const out = await handler({ repo: "o/r", path: "large.txt" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("2.0 MB");
    expect(out.content[0].text).toContain("exceeds the 512.0 KB limit");
    expect(out.content[0].text).not.toContain("empty file");
  });

  it.each([
    { encoding: "none", content: "" },
    { encoding: "base64", content: "" },
    { encoding: undefined, content: undefined },
  ])("accepts genuine size-zero empty files: %j", async (overrides) => {
    const { handler } = captureTool(registerReadFileTool);
    mockResponse(fileResponse({ ...overrides, size: 0 }));

    const out = await handler({ repo: "o/r", path: "empty.txt" });

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toBe("(empty file: o/r/empty.txt)");
  });

  it.each([
    { encoding: "none", content: "" },
    { encoding: "utf-8", content: "hello" },
    { encoding: undefined },
    { content: undefined },
    { content: null },
    { content: "" },
    { content: " \n\t" },
  ])("rejects missing or unsupported inline content rather than reporting empty: %j", async (overrides) => {
    const { handler } = captureTool(registerReadFileTool);
    mockResponse(fileResponse(overrides));

    const out = await handler({ repo: "o/r", path: "unavailable.txt" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("missing or unsupported inline content");
    expect(out.content[0].text).not.toContain("empty file");
  });

  it("continues rejecting binary content", async () => {
    const { handler } = captureTool(registerReadFileTool);
    mockResponse(fileResponse({ content: Buffer.from("a\u0000b").toString("base64"), size: 3 }));

    const out = await handler({ repo: "o/r", path: "binary.bin" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("appears to be binary");
  });

  it("reports directory paths as errors with guidance to the listing tool", async () => {
    const { handler } = captureTool(registerReadFileTool);
    mockResponse([]);

    const out = await handler({ repo: "o/r", path: "docs" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("is a directory, not a file");
    expect(out.content[0].text).toContain("github_get_repo_structure");
  });

  it("preserves useful not-found errors", async () => {
    const { handler } = captureTool(registerReadFileTool);
    mockResponse({ message: "Not Found" }, 404);

    const out = await handler({ repo: "o/r", path: "missing.md", ref: "main" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe("GitHub resource not found: o/r/missing.md@main");
  });
});

describe("github_get_repo_structure handler", () => {
  it.each([undefined, "/", ""])("lists root entries for path %j with directories first", async (path) => {
    const { name, schema, handler } = captureTool(registerGetRepoStructureTool);
    mockResponse([
      { name: "z.txt", path: "z.txt", type: "file", size: 1024 },
      { name: "src", path: "src", type: "dir", size: 0 },
      { name: "a.txt", path: "a.txt", type: "file", size: 4 },
    ]);

    const out = await handler({ repo: "o/r", path });

    expect(name).toBe("github_get_repo_structure");
    expect(Object.keys(schema)).toEqual(["repo", "path", "ref"]);
    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toBe("## o/r (root)\n\n📁 src\n📄 a.txt (4 B)\n📄 z.txt (1.0 KB)");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/o/r/contents/");
  });

  it("preserves ordinary nested directory paths and trailing slashes", async () => {
    const { handler } = captureTool(registerGetRepoStructureTool);
    mockResponse([
      { name: "link", path: "docs/nested/link", type: "symlink", size: 0 },
      { name: "module", path: "docs/nested/module", type: "submodule", size: 0 },
    ]);

    const out = await handler({ repo: "o/r", path: "docs/nested/", ref: "v1.0" });

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toBe("## o/r/docs/nested/\n\n🔗 link\n📦 module");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/o/r/contents/docs/nested/?ref=v1.0");
  });

  it("keeps an empty directory successful", async () => {
    const { handler } = captureTool(registerGetRepoStructureTool);
    mockResponse([]);

    const out = await handler({ repo: "o/r", path: "docs" });

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toBe("## o/r/docs\n\n(empty directory)");
  });

  it("reports a file path with guidance to the file-reading tool", async () => {
    const { handler } = captureTool(registerGetRepoStructureTool);
    mockResponse(fileResponse());

    const out = await handler({ repo: "o/r", path: "README.md" });

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("is a file, not a directory");
    expect(out.content[0].text).toContain("github_read_file");
  });
});

describe.each([
  { name: "github_read_file", register: registerReadFileTool, response: fileResponse() },
  { name: "github_get_repo_structure", register: registerGetRepoStructureTool, response: [] },
])("$name path handling", ({ register, response }) => {
  it("encodes reserved characters in each segment without changing slashes or the ref", async () => {
    const { handler } = captureTool(register);
    mockResponse(response);

    const out = await handler({ repo: "o/r", path: "/docs/a #?%/résumé?.md", ref: "feature/#?%" });

    expect(out.isError).toBeUndefined();
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/repos/o/r/contents/docs/a%20%23%3F%25/r%C3%A9sum%C3%A9%3F.md");
    expect(url.searchParams.get("ref")).toBe("feature/#?%");
    expect([...url.searchParams.keys()]).toEqual(["ref"]);
    expect(url.hash).toBe("");
  });

  it("treats percent-encoded-looking filenames as literal names", async () => {
    const { handler } = captureTool(register);
    mockResponse(response);

    const out = await handler({ repo: "o/r", path: "%2e%2e/100%.txt" });

    expect(out.isError).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/o/r/contents/%252e%252e/100%25.txt");
  });

  it.each([".", "..", "../secret", "/docs/../secret", "docs/./file", "docs/..", "docs/."])(
    "rejects traversal segments in %j before fetching",
    async (path) => {
      const { handler } = captureTool(register);

      const out = await handler({ repo: "o/r", path });

      expect(out.isError).toBe(true);
      expect(out.content[0].text).toContain("must not contain '.' or '..' traversal segments");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
