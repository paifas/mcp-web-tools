import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../../config.js";
import type { SearchProvider } from "../../providers/search-provider.js";
import { TavilyError, TavilySearchProvider } from "../../providers/tavily/tavily-search.js";
import type { UsageResponse } from "../../types.js";
import { registerCreditBalanceTool } from "./index.js";

function captureTool(provider: SearchProvider) {
  const tool = vi.fn();
  registerCreditBalanceTool({ tool } as unknown as McpServer, {} as ServerConfig, provider);
  const [name, description, schema, handler] = tool.mock.calls[0] as [
    string,
    string,
    Record<string, unknown>,
    () => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>,
  ];
  return { name, description, schema, handler };
}

const usage: UsageResponse = {
  provider: "tavily",
  plan: "Researcher",
  used: 33,
  limit: 1000,
  remaining: 967,
  breakdown: { search: 27, extract: 6 },
};

describe("credit_balance handler", () => {
  let getUsage: ReturnType<typeof vi.fn<NonNullable<SearchProvider["getUsage"]>>>;
  let provider: SearchProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUsage = vi.fn<NonNullable<SearchProvider["getUsage"]>>().mockResolvedValue(usage);
    provider = { name: "tavily", search: vi.fn(), getUsage };
    fetchMock = vi.fn().mockRejectedValue(new Error("Unexpected mocked provider request"));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("calls the provider and labels the returned allowance as account-plan remaining", async () => {
    const { name, description, schema, handler } = captureTool(provider);

    const out = await handler();

    expect(name).toBe("credit_balance");
    expect(schema).toEqual({});
    expect(description).toContain("account-plan credit allowance");
    expect(description).toContain("not guaranteed");
    expect(getUsage).toHaveBeenCalledTimes(1);
    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toContain("account plan: Researcher — 33 / 1000 account-plan credits (3% used)");
    expect(out.content[0].text).toContain("Account-plan remaining: 967");
    expect(out.content[0].text).toContain("not guaranteed spendable API-key or pay-as-you-go capacity");
    expect(out.content[0].text).toContain("Breakdown — search: 27, extract: 6");
  });

  it("uses Tavily account-plan usage even when the key limit and PAYG allowance differ", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          key: { usage: 10, limit: 10 },
          account: {
            current_plan: "Researcher",
            plan_usage: 33,
            plan_limit: 1000,
            paygo_usage: 100,
            paygo_limit: 500,
            search_usage: 27,
            extract_usage: 6,
            crawl_usage: 0,
            map_usage: 0,
            research_usage: 0,
          },
        }),
        { status: 200 },
      ),
    );
    const { handler } = captureTool(new TavilySearchProvider("fake-key"));

    const out = await handler();

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toContain("Account-plan remaining: 967");
    expect(out.content[0].text).toContain("not guaranteed spendable API-key or pay-as-you-go capacity");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.tavily.com/usage");
  });

  it("identifies low account-plan allowance without implying a top-up is necessary", async () => {
    getUsage.mockResolvedValue({ ...usage, used: 970, remaining: 30 });
    const { handler } = captureTool(provider);

    const out = await handler();

    expect(out.content[0].text).toContain("Account-plan remaining: 30");
    expect(out.content[0].text).toContain("Account-plan allowance is running low");
    expect(out.content[0].text).not.toContain("Top up");
  });

  it("does not warn when account-plan allowance is healthy", async () => {
    const { handler } = captureTool(provider);

    const out = await handler();

    expect(out.content[0].text).not.toContain("running low");
  });

  it("handles a zero plan limit and an absent plan name", async () => {
    getUsage.mockResolvedValue({ ...usage, plan: undefined, limit: 0, used: 0, remaining: 0 });
    const { handler } = captureTool(provider);

    const out = await handler();

    expect(out.isError).toBeUndefined();
    expect(out.content[0].text).toContain("0 / 0 account-plan credits (0% used)");
    expect(out.content[0].text).not.toMatch(/undefined|NaN|Infinity/);
  });

  it("returns an error for providers without usage support", async () => {
    const { handler } = captureTool({ name: "searxng", search: vi.fn() });

    const out = await handler();

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe('credit_balance is not supported by the "searxng" provider.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves provider errors", async () => {
    getUsage.mockRejectedValue(new TavilyError("Invalid API key", 401));
    const { handler } = captureTool(provider);

    const out = await handler();

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe("Credit balance error: Invalid API key");
  });

  it.each([new Error("Network unavailable"), "Network unavailable"])("reports unexpected errors: %s", async (error) => {
    getUsage.mockRejectedValue(error);
    const { handler } = captureTool(provider);

    const out = await handler();

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toBe("Unexpected error: Network unavailable");
  });
});
