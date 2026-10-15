# Research: token usage and pricing

Issue: #2 (parent #1). Retrieved and verified: 2026-10-15. All prices USD per million tokens (MTok), standard (non-batch) tier, global routing.

## Recommendation (short)

- Record the provider's raw `usage` object for every LLM call, plus a normalized record (fields below). Never derive tokens from text length.
- Compute cost locally from a **bundled, versioned price table** (`prices.json` in the repo, one entry per model with explicit per-bucket rates, `retrievedAt` and `sourceUrl`), merged with an **optional user override file**. Do not fetch prices at runtime: neither provider exposes prices through an API.
- Stamp every results file with the price table version used, so old Runs can be recomputed when prices change.
- Unknown model: show tokens, show cost as "n/a (no price for model X)", never guess.

## 1. How each API reports usage

### Anthropic Messages API (`message.usage`)

| Field | Meaning | Billing note |
| --- | --- | --- |
| `input_tokens` | Uncached input tokens only | Base input rate |
| `cache_creation_input_tokens` | Tokens written to cache | Cache write rate |
| `cache_creation.ephemeral_5m_input_tokens` | Of those, written with 5 minute TTL | 1.25x base input |
| `cache_creation.ephemeral_1h_input_tokens` | Of those, written with 1 hour TTL | 2x base input |
| `cache_read_input_tokens` | Tokens read from cache | 0.1x base (0.05x Opus 5.5 / Sonnet 5.5, 0.025x Fable 5.1) |
| `output_tokens` | All output, inclusive and authoritative for billing | Output rate |
| `output_tokens_details.thinking_tokens` | Subset of `output_tokens` spent on reasoning | Observability only, already in `output_tokens` |
| `service_tier` | `standard`, `priority` or `batch` | Selects price tier |
| `inference_geo` | Region used | `us` means 1.1x on 4.6+ models |
| `speed` | `fast` or `standard` (fast mode, beta) | Fast mode prices |
| `server_tool_use.web_search_requests` / `web_fetch_requests` | Server tool counts | Web search $10 per 1,000 |

- Total input is `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`; `input_tokens` alone excludes cache tokens.[3]
- `output_tokens` is "the inclusive, authoritative total used for billing" and `thinking_tokens` is a read-only decomposition of it.[3]
- In streaming, `message_delta.usage` values are cumulative, so keep the last one.[3]
- Cache multipliers: 5 minute write 1.25x, 1 hour write 2x, read 0.1x base, with 0.025x on Fable 5.1 / Mythos 5.1 and 0.05x on Opus 5.5 / Sonnet 5.5.[1]
- `inference_geo: "us"` applies 1.1x to all token categories on Claude 4.6 and later models.[1]
- Fast mode reports `usage.speed`; Opus 5.5 fast mode costs $8 input / $40 output.[5][1]
- Images: there is **no separate image token field**. Screenshots are billed as image input inside the input buckets above.[1] Visual tokens are `ceil(width/28) x ceil(height/28)`, capped at 2576 px long edge / 4784 tokens on Claude 4.7 and later, and 1568 px / 1568 tokens on older models.[4] Screenshots returned to the browser or computer use toolsets are rejected (not downscaled) if over the limit, so resize them client side.[4]
- Tool definitions add input tokens, plus a per-model tool use system prompt (for example 286 tokens on Opus 5.5 with `tool_choice` auto).[1] This matters for the comparison: the WebMCP lane carries extra tool schemas on every call, and that cost shows up in `input_tokens` (or cache buckets) automatically.

### OpenAI Responses API (`response.usage`)

| Field | Meaning | Billing note |
| --- | --- | --- |
| `input_tokens` | All input, **including** cached and cache-write tokens | See formula |
| `input_tokens_details.cached_tokens` | Tokens read from cache | Cached input rate |
| `input_tokens_details.cache_write_tokens` | Tokens written to cache | Cache write rate (GPT-5.6 and later only) |
| `output_tokens` | All output, including reasoning | Output rate |
| `output_tokens_details.reasoning_tokens` | Subset of output spent on reasoning | Already in `output_tokens` |
| `total_tokens` | Input plus output | Do not bill from this |
| `response.service_tier` (top level, not in usage) | Tier actually used: `default`, `flex`, `priority` (Fast mode), `ultrafast` | Selects price tier |

- Field definitions are from the `ResponseUsage` schema.[9]
- OpenAI's own cost example computes ordinary input as `input_tokens - cached_tokens - cache_write_tokens`, which confirms `input_tokens` is inclusive (the opposite of Anthropic).[10]
- For GPT-5.6 and later, cache writes cost 1.25x and reads 0.1x the uncached input rate (0.05x on GPT-6.1 Sol); earlier models have no cache write charge.[10]
- Reasoning tokens "are billed as output tokens".[12]
- The response body reports the `service_tier` actually used, which may differ from the requested one; Fast mode shows as `priority`.[9]
- Images: also **no separate image token field** in `ResponseUsage`.[9] For current models, image tokens are `ceil(w/32) x ceil(h/32)` patches (after the model's resize rules) times a model multiplier (1.2 for gpt-6-astra, gpt-5.6-*, gpt-5.5, gpt-5.4*), billed at the input rate.[11] The input token count endpoint returns exact counts for inputs with images if a pre-call estimate is ever needed.[14]
- The multiplier table does not list `gpt-6.1-sol` or `gpt-6-luna`, so their image multiplier is unverified.[11]
- Chat Completions usage fields (`prompt_tokens_details`, `completion_tokens_details`) were not verified in this research; use the Responses API.[unverified]

### Screenshot token estimates (computed from the documented formulas)

| Screenshot | Claude 4.7+ (28 px patches) | gpt-6-astra `detail: auto/high` (32 px patches x 1.2) |
| --- | --- | --- |
| 1280 x 800 | 46 x 29 = 1,334 tokens | 40 x 25 = 1,000 patches, 1,200 tokens |
| 1920 x 1080 | 2,691 tokens (doc table) | 60 x 34 = 2,040 patches, 2,448 tokens |

Claude figure for 1920 x 1080 is from the vision docs table; the others are our arithmetic using the documented formulas.[4][11] Every screenshot still in the conversation history is re-billed on every later call (as cache read if cached), which is the main cost driver of the Baseline lane.

## 2. Fields to record per LLM call

Store one record per API call, append-only, in the Run's results file:

```ts
interface LlmCallUsage {
  runId: string; scenarioId: string; lane: "baseline" | "webmcp"; callIndex: number;
  provider: "anthropic" | "openai";
  modelRequested: string; modelReported: string; requestId: string;
  startedAt: string; durationMs: number;           // wall clock per call
  // normalized token buckets (disjoint, sum = total input)
  inputUncachedTokens: number;   // anthropic: input_tokens | openai: input_tokens - cached - cache_write
  cacheReadTokens: number;       // anthropic: cache_read_input_tokens | openai: cached_tokens
  cacheWrite5mTokens: number;    // anthropic: ephemeral_5m (or cache_creation_input_tokens if breakdown missing) | openai: cache_write_tokens
  cacheWrite1hTokens: number;    // anthropic: ephemeral_1h | openai: 0
  totalInputTokens: number;      // sum of the four above
  outputTokens: number;          // inclusive of reasoning
  reasoningTokens: number;       // anthropic: thinking_tokens | openai: reasoning_tokens (subset, display only)
  // pricing modifiers as reported by the response
  serviceTier: string | null; speed: string | null; inferenceGeo: string | null;
  serverToolRequests?: Record<string, number>;
  // screenshots
  newScreenshots: number;         // screenshots added by this step
  imagesInRequest: number;        // all image blocks sent in this call (history included)
  estImageTokens: number;         // our estimate, labelled "estimate" in the UI
  // cost
  priceTableVersion: string; costUsd: number | null;
  rawUsage: unknown;              // provider usage object verbatim, for recompute and audit
}
```

## 3. Cost formula

Use explicit per-bucket rates from the price table (not multipliers), because some models deviate from the standard multipliers.[1][10]

```
cost = inputUncached * P.input
     + cacheRead     * P.cacheRead
     + cacheWrite5m  * P.cacheWrite5m      // openai: P.cacheWrite
     + cacheWrite1h  * P.cacheWrite1h
     + output        * P.output             // reasoning already included
     (all P in USD per token = $/MTok / 1e6)
```

Tier and modifier selection, applied per call:

1. **Context tier.** Anthropic Haiku 5.5: if total input (including cache reads and writes) is over 100,000 tokens, the whole request uses the higher prices.[1] OpenAI: over 272K input tokens uses long context prices.[7] Other current Claude models have flat pricing across the full 1M window.[1]
2. **Service tier / speed.** Anthropic `usage.speed == "fast"` uses fast mode prices.[5][1] OpenAI `service_tier` `flex`, `priority` or `ultrafast` uses that tier's table.[9][7]
3. **Residency.** Anthropic `inference_geo == "us"` multiplies everything by 1.1 (4.6+ models).[1] OpenAI regional endpoints add 10% for models released on or after 2026-03-05.[7] The app should default to neither and only apply the multiplier if the response says so.
4. **Server tools.** Add per-request fees (Anthropic web search $10 per 1,000).[1] Not expected in this app.

Cross-check against Anthropic's worked example: 10,000 uncached x $4 + 40,000 cache reads x $0.20 + 15,000 output x $20 on Opus 5.5 gives $0.348 in tokens.[1]

## 4. Current prices (standard tier, retrieved 2026-10-15)

### Anthropic (current lineup)

| Model (API ID) | Input | 5m cache write | 1h cache write | Cache read | Output |
| --- | --- | --- | --- | --- | --- |
| Claude Fable 5.1 (`claude-fable-5-1`) | 10.00 | 12.50 | 20.00 | 0.25 | 50.00 |
| Claude Opus 5.5 (`claude-opus-5-5`) | 4.00 | 5.00 | 8.00 | 0.20 | 20.00 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2.00 | 2.50 | 4.00 | 0.10 | 10.00 |
| Claude Haiku 5.5 (`claude-haiku-5-5`), prompt up to 100K | 0.10 | 0.125 | 0.20 | 0.01 | 0.50 |
| Claude Haiku 5.5, prompt over 100K | 0.50 | 0.625 | 1.00 | 0.05 | 2.50 |
| Claude Opus 5 (legacy) | 5.00 | 6.25 | 10.00 | 0.50 | 25.00 |
| Claude Sonnet 5 (legacy) | 2.00 | 2.50 | 4.00 | 0.20 | 10.00 |
| Claude Haiku 4.5 (legacy) | 1.00 | 1.25 | 2.00 | 0.10 | 5.00 |

Prices are from the pricing page; the lineup and API IDs from the models overview.[1][2] Sonnet 5's $2/$10 introductory price is now standard.[1] Claude 4.7 and later use a tokenizer that yields about 30% more tokens for the same text, so cross-generation token counts are not directly comparable.[1]

### OpenAI (featured plus GPT-5.6 / 5.5)

| Model | Input | Cached input | Cache write | Output | Long ctx (over 272K) in / cached / write / out |
| --- | --- | --- | --- | --- | --- |
| `gpt-6-astra` | 10.00 | 1.00 | 12.50 | 50.00 | 20.00 / 2.00 / 25.00 / 75.00 |
| `gpt-6.1-sol` | 2.00 | 0.10 | 2.50 | 10.00 | 4.00 / 0.20 / 5.00 / 15.00 |
| `gpt-6-luna` | 0.10 | 0.01 | 0.125 | 0.50 | 0.20 / 0.02 / 0.25 / 0.75 |
| `gpt-5.6-sol` | 4.00 | 0.40 | 5.00 | 20.00 | 8.00 / 0.80 / 10.00 / 30.00 |
| `gpt-5.6-terra` | 2.00 | 0.20 | 2.50 | 12.00 | 4.00 / 0.40 / 5.00 / 18.00 |
| `gpt-5.6-luna` | 0.20 | 0.02 | 0.25 | 1.20 | 0.40 / 0.04 / 0.50 / 1.80 |
| `gpt-5.5` | 5.00 | 0.50 | none | 30.00 | 10.00 / 1.00 / none / 45.00 |

OpenAI features gpt-6-astra, gpt-6.1-sol and gpt-6-luna as its current recommended models.[8] Prices are the Standard table of the pricing page; Fast mode is 2x Standard for the GPT-6 and GPT-5.6 models (2.5x for gpt-5.5), and GPT-5.6 Sol's promotional price runs at least through 2026-11-21.[7]

## 5. Where prices should come from

| Option | Verdict | Why |
| --- | --- | --- |
| Fetch from provider API at runtime | Not possible | Anthropic's Models API returns token limits and capabilities but no prices; OpenAI's Models API returns `id`, `created`, `owned_by`, `shutdown_date`.[6][13] |
| Scrape provider pricing pages at runtime | Reject | Human docs, not a contract; formats change (OpenAI added cache write columns and long context columns for newer models).[7] Breaks offline use. |
| Third party feed (LiteLLM JSON, OpenRouter `/api/v1/models`) at runtime | Reject as runtime source, use as maintainer cross-check | Both already carry today's models with cache and long context rates matching the official pages, but they are third party, add a network dependency, and OpenRouter prices are for its own routing.[15][16] |
| **Bundled table + optional user override** | **Recommend** | Deterministic, offline, reviewable in git, reproducible cost per Run. Override covers negotiated discounts and new models without a release. |

### Update story

1. `src/pricing/prices.json` (bundled): `{ version: "2026-10-15", providers: { anthropic: { sourceUrl, retrievedAt, models: { "claude-opus-5-5": { input, output, cacheRead, cacheWrite5m, cacheWrite1h, tiers?: [{ minInputTokens: 100000, ... }], fast?: {...} } } }, openai: {...} } }`. Rates stored as $/MTok exactly as printed on the pricing page so a reviewer can diff by eye.
2. User override at `~/.webmcp-comparer/prices.json` (or a path in the Suite): deep merged over the bundled file per model. UI shows "custom price" when an override is active.
3. Maintainer script `npm run prices:check`: fetches the markdown versions of both pricing pages (`https://platform.claude.com/docs/en/about-claude/pricing.md`, `https://developers.openai.com/api/docs/pricing.md`) and the LiteLLM JSON, prints differences against the bundled table, and never writes automatically. Run it before releases or when a provider announces a model.
4. Results files store `priceTableVersion` and `rawUsage`; a "recompute cost" action can reprice an old Run with the current table.
5. UI labels cost as "approximate": it excludes taxes, negotiated discounts and any rounding the provider applies on the invoice, and image tokens shown separately are estimates.

## Sources

[1] Anthropic: Pricing: https://platform.claude.com/docs/en/about-claude/pricing
[2] Anthropic: Models overview: https://platform.claude.com/docs/en/about-claude/models/overview
[3] Anthropic: Messages API reference (Usage object): https://platform.claude.com/docs/en/api/messages
[4] Anthropic: Vision (image token cost): https://platform.claude.com/docs/en/build-with-claude/vision
[5] Anthropic: Fast mode: https://platform.claude.com/docs/en/build-with-claude/fast-mode
[6] Anthropic: Models API (list): https://platform.claude.com/docs/en/api/models/list
[7] OpenAI: Pricing: https://developers.openai.com/api/docs/pricing
[8] OpenAI: Models: https://developers.openai.com/api/docs/models
[9] OpenAI: Responses API create (ResponseUsage): https://developers.openai.com/api/reference/resources/responses/methods/create
[10] OpenAI: Prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
[11] OpenAI: Images and vision (calculating costs): https://developers.openai.com/api/docs/guides/images-vision
[12] OpenAI: Reasoning models: https://developers.openai.com/api/docs/guides/reasoning
[13] OpenAI: Models API reference: https://developers.openai.com/api/reference/resources/models
[14] OpenAI: Token counting: https://developers.openai.com/api/docs/guides/token-counting
[15] LiteLLM model_prices_and_context_window.json (third party): https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
[16] OpenRouter models API (third party): https://openrouter.ai/api/v1/models
