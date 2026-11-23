import { z } from "zod";
import type { ExtractProvider, ExtractParams } from "../extract-provider.js";
import type { ExtractResponse, ExtractResult } from "../../types.js";
import { chunk, sleep } from "../utils.js";

const scrapeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    markdown: z.string(),
    metadata: z.object({ sourceURL: z.string().optional() }).optional(),
  }),
});

const MAX_ATTEMPTS = 3;
const SCRAPE_TIMEOUT_MS = 30_000;
const RETRY_FALLBACK_MS = 5_000;
const RETRY_WAIT_BUDGET_MS = 15_000;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function retryWaitMs(header: string | null): number {
  const value = header?.trim();
  if (!value) return RETRY_FALLBACK_MS;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    // Round up so a fractional millisecond never triggers an early retry.
    return Math.ceil(Number(value) * 1000);
  }
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    const date = new Date(timestamp);
    const canonical = date.toUTCString();
    const [weekday, day, month, year, time] = canonical.split(" ");
    // Round-trip the three HTTP date forms: Date.parse alone accepts invalid
    // days, overflowing times, and strings that are not HTTP dates at all.
    const httpDates = [
      canonical,
      `${WEEKDAYS[date.getUTCDay()]}, ${day}-${month}-${year.slice(-2)} ${time} GMT`,
      `${weekday.slice(0, 3)} ${month} ${String(date.getUTCDate()).padStart(2, " ")} ${time} ${year}`,
    ];
    if (httpDates.includes(value)) return Math.max(0, timestamp - Date.now());
  }
  return RETRY_FALLBACK_MS;
}

function providerErrorDetails(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const fields = payload as Record<string, unknown>;
  const details = [fields.error, fields.message, fields.details]
    .map((value) =>
      typeof value === "string"
        ? value.trim()
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : "",
    )
    .filter(Boolean);
  return details.length > 0 ? details.join("; ") : undefined;
}

async function readErrorDetails(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return response.statusText;
  try {
    return providerErrorDetails(JSON.parse(text)) ?? text;
  } catch {
    return text;
  }
}

/**
 * Firecrawl extract provider.
 *
 * Supports hosted and custom v2-compatible endpoints. Authentication is optional;
 * when configured, the bearer key is sent to the selected endpoint.
 *
 * Uses /v2/scrape in a bounded-concurrency loop rather than /v2/batch/scrape
 * (which is async/job-ID-based — wrong shape for a synchronous MCP tool call).
 */
export class FirecrawlProvider implements ExtractProvider {
  readonly name = "firecrawl";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async extract(params: ExtractParams): Promise<ExtractResponse> {
    const endpoint = `${this.baseUrl.replace(/\/$/, "")}/v2/scrape`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const batches = chunk(params.urls, 5);
    const results: ExtractResult[] = [];
    const failedResults: ExtractResponse["failedResults"] = [];

    // Run batches sequentially, URLs within a batch in parallel.
    for (const batch of batches) {
      const settled = await Promise.allSettled(batch.map((u) => this.scrapeOne(u, params, endpoint, headers)));
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === "fulfilled") {
          results.push(r.value);
        } else {
          failedResults.push({ url: batch[i], error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
        }
      }
    }
    return { results, failedResults };
  }

  private async scrapeOne(
    url: string,
    params: ExtractParams,
    endpoint: string,
    headers: Record<string, string>,
  ): Promise<ExtractResult> {
    const body = {
      url,
      formats: ["markdown"],
      // Main-content filtering is a deterministic HTML pass (no LLM, no extra
      // cost) that drops nav, headers and footers. It is on for every depth:
      // boilerplate is never what the caller asked to read.
      onlyMainContent: true,
    };

    let remainingWaitMs = RETRY_WAIT_BUDGET_MS;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });

      if (res.status === 429) {
        const details = await readErrorDetails(res);
        const message = `Firecrawl rate limit (429)${details ? `: ${details}` : ""}`;
        if (attempt === MAX_ATTEMPTS) {
          throw new Error(
            `${message}. Exhausted after ${MAX_ATTEMPTS} attempts. Try again later or check your Firecrawl service limits.`,
          );
        }
        const waitMs = retryWaitMs(res.headers.get("retry-after"));
        if (waitMs > remainingWaitMs) {
          throw new Error(
            `${message}. Retry-After requires ${waitMs}ms, exceeding the remaining ${remainingWaitMs}ms retry wait budget. Try again later.`,
          );
        }
        remainingWaitMs -= waitMs;
        if (waitMs > 0) await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        // Non-429 errors are not retryable.
        throw new Error(`Firecrawl error (${res.status}): ${await readErrorDetails(res)}`);
      }

      const payload: unknown = await res.json().catch(() => {
        throw new Error("Invalid Firecrawl response: expected JSON.");
      });
      if (typeof payload === "object" && payload !== null && "success" in payload && payload.success === false) {
        throw new Error(`Firecrawl scrape unsuccessful: ${providerErrorDetails(payload) ?? "success was false"}`);
      }
      const parsed = scrapeResponseSchema.safeParse(payload);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`);
        const details = providerErrorDetails(payload);
        throw new Error(`Invalid Firecrawl response: ${issues.join("; ")}${details ? `; ${details}` : ""}`);
      }
      return {
        url: parsed.data.data.metadata?.sourceURL ?? url,
        content: parsed.data.data.markdown,
      };
    }
    throw new Error("Firecrawl scrape failed (unreachable)");
  }
}
