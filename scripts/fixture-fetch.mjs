// Used only by smoke.mjs. Never permit real provider calls in a smoke test.
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const origin = process.env.WEBTOOLS_TEST_ORIGIN;
  if (url.hostname === "api.tavily.com") {
    return fetchOriginal(`${origin}/tavily${url.pathname}${url.search}`, init);
  }
  if (url.origin === origin) return fetchOriginal(input, init);
  throw new Error(`Smoke test blocked external fetch to ${url.origin}`);
};
