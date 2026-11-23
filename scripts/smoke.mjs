import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "webtools-smoke-"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const sessions = [];
const requests = [];
const attempts = new Map();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmRun = (args, cwd) =>
  execFileSync(npm, args, { cwd, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
const text = (result) =>
  result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
const call = (client, name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 5000 });

class ObservedStdioTransport extends StdioClientTransport {
  stdout = "";
  async start() {
    const started = super.start();
    // Test-only instrumentation of the reviewed SDK 1.x transport. Its public
    // onclose callback discards exit status and also fires for abrupt termination.
    const child = this._process;
    assert.ok(child, "SDK transport internals changed; update smoke instrumentation.");
    this.exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
    child.stdout.on("data", (chunk) => {
      this.stdout += chunk;
    });
    await started;
  }
}

const fixture = http.createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : {};
    const url = new URL(req.url, "http://localhost");
    requests.push({ path: url.pathname, data });
    const send = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname === "/search") {
      return send(200, {
        results: [{ title: "Fixture", url: "https://example.com/source", content: "Search evidence" }],
      });
    }
    if (url.pathname === "/v2/scrape") {
      const count = (attempts.get(data.url) ?? 0) + 1;
      attempts.set(data.url, count);
      if (data.url.endsWith("/recover") && count === 1) return send(503, { error: "temporary fixture outage" });
      // Oversized page, used to prove the truncation notice in the real binary.
      if (data.url.endsWith("/long")) return send(200, { success: true, data: { markdown: "L".repeat(30_000) } });
      return send(200, { success: true, data: { markdown: "# Fixture page", metadata: { sourceURL: data.url } } });
    }
    if (url.pathname === "/tavily/search") {
      return send(200, {
        query: data.query,
        results: [{ title: "Fixture", url: "https://example.com", content: "Tavily evidence", score: 1 }],
        response_time: 1.25,
      });
    }
    if (url.pathname === "/tavily/extract") {
      // Mirror the real API's shape: with a query, passages joined by "[...]"
      // (measured live 2026-11-23: ~2 KB vs ~71 KB for the page); without one, the page.
      const content = data.query ? "Passage one.[...]Passage two.[...]Passage three." : "Page evidence";
      return send(200, {
        results: data.urls.map((url) => ({
          url,
          raw_content: content,
          images: ["https://example.com/image.png"],
        })),
        failed_results: [],
        response_time: 0.5,
      });
    }
    return send(404, { error: "Unexpected fixture endpoint" });
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

async function connect(origin, overrides = {}) {
  const transport = new ObservedStdioTransport({
    command: process.execPath,
    args: [
      "--import",
      path.join(root, "scripts/fixture-fetch.mjs"),
      path.join(temporary, "consumer/node_modules/.bin/mcp-web-tools"),
    ],
    cwd: temporary,
    stderr: "pipe",
    env: {
      WEBTOOLS_TEST_ORIGIN: origin,
      WEBTOOLS_SEARCH_PROVIDER: "searxng",
      SEARXNG_URL: origin,
      WEBTOOLS_EXTRACT_PROVIDER: "firecrawl",
      FIRECRAWL_URL: origin,
      WEBTOOLS_DEBUG: "1",
      ...overrides,
    },
  });
  let stderr = "";
  transport.stderr.on("data", (data) => {
    stderr += data;
  });
  const client = new Client({ name: "package-smoke", version: "1.0.0" });
  const errors = [];
  client.onerror = (error) => errors.push(error.message);
  const session = { client, transport, errors, stderr: () => stderr };
  sessions.push(session);
  await client.connect(transport);
  assert.equal(client.getServerVersion().version, pkg.version);
  return session;
}

try {
  assert.ok(fs.existsSync(path.join(root, "build/index.js")), "Run npm run build before smoke.");
  const [pack] = JSON.parse(npmRun(["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], root));
  assert.ok(pack.files.some((file) => file.path === "build/index.js"));
  assert.ok(pack.files.every((file) => !/^(src|test|scripts|node_modules|\.specs)\//.test(file.path)));
  assert.ok(pack.files.every((file) => !/\.test\./.test(file.path)));
  const packedPaths = new Set(pack.files.map((file) => file.path));
  for (const file of [
    "README.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "docs/clients.md",
    "docs/configuration.md",
    "docs/self-hosting.md",
    "docs/tools.md",
    "docs/troubleshooting.md",
  ]) {
    assert.ok(packedPaths.has(file), `Missing published guide: ${file}`);
    const markdown = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), href.split("#")[0]));
      assert.ok(packedPaths.has(target), `Broken packaged documentation link: ${file} -> ${href}`);
    }
  }
  assert.ok(!packedPaths.has("docs/production-readiness-audit.md"), "Historical audit should not ship in npm");
  const tarball = path.join(temporary, pack.filename);
  const consumer = path.join(temporary, "consumer");
  fs.mkdirSync(consumer);
  const manifest = {
    name: "webtools-smoke-consumer",
    version: "1.0.0",
    private: true,
    dependencies: { ...pkg.dependencies, "mcp-web-tools": `file:${tarball}` },
    devDependencies: pkg.devDependencies,
  };
  lock.name = manifest.name;
  lock.version = manifest.version;
  lock.packages[""] = { ...manifest };
  lock.packages["node_modules/mcp-web-tools"] = {
    version: pkg.version,
    resolved: `file:${tarball}`,
    integrity: `sha512-${createHash("sha512").update(fs.readFileSync(tarball)).digest("base64")}`,
    dependencies: pkg.dependencies,
    bin: pkg.bin,
    engines: pkg.engines,
  };
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(consumer, "package-lock.json"), JSON.stringify(lock));
  // Root npm ci populated the cache; do not resolve newer dependencies or call a registry.
  npmRun(["ci", "--offline", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"], consumer);
  const installedLock = JSON.parse(fs.readFileSync(path.join(consumer, "node_modules/.package-lock.json"), "utf8"));
  for (const [name, entry] of Object.entries(installedLock.packages)) {
    assert.equal(entry.version, lock.packages[name]?.version, `Unexpected dependency version: ${name}`);
  }
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const origin = `http://127.0.0.1:${fixture.address().port}`;
  const session = await connect(origin);
  const inventory = (await session.client.listTools()).tools;
  assert.deepEqual(inventory.map((tool) => tool.name).sort(), [
    "credit_balance",
    "github_get_repo_structure",
    "github_read_file",
    "github_search_repo",
    "web_read",
    "web_search",
  ]);
  const searchSchema = inventory.find((tool) => tool.name === "web_search").inputSchema;
  assert.equal(searchSchema.properties.maxResults.type, "integer");
  assert.deepEqual(searchSchema.required, ["query"]);
  const search = await call(session.client, "web_search", { query: "fixture" });
  assert.match(text(search), /Search evidence/);
  await call(session.client, "web_search", { query: "fixture" });
  assert.equal(requests.filter((request) => request.path === "/search").length, 1);
  assert.equal((await call(session.client, "web_search", { query: " " })).isError, true);
  assert.equal((await call(session.client, "web_read", { urls: ["https://user:secret@example.com"] })).isError, true);
  const args = { urls: ["https://example.com/recover"] };
  assert.equal((await call(session.client, "web_read", args)).isError, true);
  assert.equal((await call(session.client, "web_read", args)).isError, false);
  assert.match(text(await call(session.client, "web_read", args)), /Fixture page/);
  assert.equal(attempts.get(args.urls[0]), 2);
  // The default 20,000-character limit is active in this real binary. This session
  // reads through Firecrawl, whose fixture serves an oversized page for /long.
  const truncated = text(await call(session.client, "web_read", { urls: ["https://example.com/long"] }));
  assert.match(truncated, /\[truncated: showing 20000 of 30000 characters\]/);
  const tavily = await connect(origin, {
    WEBTOOLS_SEARCH_PROVIDER: "tavily",
    WEBTOOLS_EXTRACT_PROVIDER: "tavily",
    TAVILY_API_KEY: "fixture-not-a-real-key",
  });
  assert.match(text(await call(tavily.client, "web_search", { query: "fixture" })), /1250ms/);
  assert.match(
    text(await call(tavily.client, "web_read", { urls: ["https://example.com"], includeImages: true })),
    /image\.png/,
  );
  // Relevance query: reaches the provider and returns passages rather than the page.
  const focused = text(
    await call(tavily.client, "web_read", { urls: ["https://example.com"], query: "free allowance" }),
  );
  assert.match(focused, /Passage one\.\[\.\.\.\]Passage two/);
  const focusedRequest = requests.findLast((request) => request.path === "/tavily/extract");
  assert.equal(focusedRequest.data.query, "free allowance");
  assert.equal(focusedRequest.data.chunks_per_source, 3);
  assert.ok(focused.length < 400, `focused read should be small, was ${focused.length} chars`);
  const disabled = await connect(origin, { WEBTOOLS_EXTRACT_PROVIDER: "none" });
  assert.ok(!(await disabled.client.listTools()).tools.some((tool) => tool.name === "web_read"));
  for (const [target, signal] of [
    [disabled, "SIGINT"],
    [tavily, "SIGTERM"],
  ]) {
    const closed = new Promise((resolve) => {
      const onclose = target.transport.onclose;
      target.transport.onclose = () => {
        onclose?.();
        resolve();
      };
    });
    process.kill(target.transport.pid, signal);
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${signal} did not close the server within 5 seconds`)), 5000);
    });
    try {
      const [exit] = await Promise.race([Promise.all([target.transport.exited, closed]), deadline]);
      assert.deepEqual(exit, { code: 0, signal: null }, `${signal} terminated abruptly rather than shutting down`);
    } finally {
      clearTimeout(timer);
    }
  }
  for (const session of sessions) {
    assert.deepEqual(session.errors, [], "Unexpected protocol/stdout errors");
    const lines = session.transport.stdout.trim().split("\n");
    assert.ok(lines.length > 0);
    for (const line of lines) assert.equal(JSON.parse(line).jsonrpc, "2.0", "Non-protocol stdout");
  }
  assert.match(session.stderr(), /cache hit/);
  console.log(
    `Package smoke passed: ${pack.files.length} files; installed bin, schemas, calls, cache recovery, Tavily mapping, disabled read, signals and stdio verified with local fixtures.`,
  );
} finally {
  await Promise.all(sessions.map((session) => session.client.close()));
  if (fixture.listening) {
    fixture.closeAllConnections();
    await new Promise((resolve) => fixture.close(resolve));
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}
