# Research: agent loop library

Ticket: #5. Question: which TypeScript option runs the per-Lane tool-calling agent loop for both Anthropic and OpenAI with accurate per-step token usage, screenshots as image inputs, streaming, and a user-supplied API key.

Checked on 2026-10-15 against current docs, npm, and the installed type definitions and provider source of the versions listed under Method.

## Decision

Use **Vercel AI SDK v7** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai`), driven by **our own outer loop** that calls `streamText` once per step.

- One normalized usage object per step covers input, non-cached input, cache read, cache write, output, and reasoning tokens for both providers, plus the provider's untouched `raw` usage.[2][4][5]
- Dynamic JSON Schema tools (`dynamicTool` + `jsonSchema`) fit WebMCP tools discovered at runtime.[1]
- `toModelOutput` returns screenshots as image content inside tool results, and both provider adapters convert that to the native format.[1]
- API keys go in per Run through `createAnthropic({ apiKey })` / `createOpenAI({ apiKey })`.[4][5]
- Fall back to the official SDKs only for a field the AI SDK drops. `usage.raw` already covers the known gaps (see Risks).

Not chosen: a hand-written adapter over the official SDKs (two message formats, two stream parsers, and two usage mappers to build and maintain), the OpenAI Agents SDK (OpenAI-first, and its other-provider support is a beta AI SDK adapter[12]), Mastra (a full framework built on the AI SDK provider spec), and LangChain.js (heavier abstraction, and the provider packages lag the official SDKs).

## Comparison

| Criterion | AI SDK v7 | Official SDKs + own adapter | OpenAI Agents SDK (JS) | Mastra | LangChain.js |
|---|---|---|---|---|---|
| Dynamic JSON Schema tools | Yes: `dynamicTool` + `jsonSchema`, input typed `unknown`[1] | Yes, native on both APIs | Yes for OpenAI. Anthropic only through the AI SDK adapter (beta)[12] | Yes (`createTool`), Zod-first[13] | Yes |
| Images inside tool results | Yes: `toModelOutput` with `image-data`/`file-data` parts[1], mapped to Anthropic `tool_result` image blocks and OpenAI `function_call_output` `input_image` (checked in provider source) | Yes: Anthropic `tool_result.content` accepts `image`[6], OpenAI function output accepts an image/file array[9] | OpenAI: yes. Anthropic: depends on the adapter (unverified) | Inherits AI SDK (unverified) | Yes, per provider package (unverified for current versions) |
| Per-step usage | `inputTokens`, `noCacheTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens`, `reasoningTokens`, `raw`[2] | Full raw fields, but we normalize them ourselves | `RequestUsage` per request with generic detail maps (from types) | Inherits AI SDK (unverified) | `usage_metadata` with `cache_read`, `cache_creation`, `reasoning`[14] |
| Anthropic cache read/write | Yes: `cache_read_input_tokens`/`cache_creation_input_tokens` map to read/write[4]. The 5m vs 1h write split is only in `raw` | Yes, including the `cache_creation` split[7] | Via adapter (unverified) | Inherits AI SDK | Yes (totals) |
| OpenAI cache read/write | Read: yes. Write: yes for GPT-5.6 and later[5] | Yes: `cached_tokens`, `cache_write_tokens`[10] | Yes (native) | Inherits AI SDK | Read yes, write unverified |
| Reasoning tokens | OpenAI `reasoning_tokens`, Anthropic `thinking_tokens` (checked in provider source) | Yes, raw | OpenAI yes | Inherits AI SDK | Yes (`reasoning`)[14] |
| Image tokens | Not reported by either provider; estimate (see below) | Same | Same | Same | Same |
| Manual step control and logging | `stopWhen`, `prepareStep`, `onStepEnd`, or a documented manual loop[3] | Full (we write the loop) | Runner owns the loop; `maxTurns` cap | Framework owns the loop | LangGraph owns the loop |
| Streaming | `streamText` `fullStream` with per-step parts | Native SSE helpers, two event models | Yes | Yes | Yes |
| API key per request | `createAnthropic({ apiKey })`, `createOpenAI({ apiKey })`[4][5] | Client per Run | Via client/adapter | Model router reads env vars by default[13]; per-request key unverified | Constructor option |
| Health (2026-10-15) | `ai` 7.0.141, Apache-2.0, 27.3k stars, very frequent releases[15][16] | `@anthropic-ai/sdk` 0.134.0, `openai` 7.34.0, both released 2026-10-14 | `@openai/agents` 0.20.0 (pre-1.0) | `@mastra/core` 1.77.0, 76 MB unpacked | `@langchain/core` 1.2.17; `@langchain/anthropic` pins `@anthropic-ai/sdk` ^0.122 |

## Findings

### Tools
- WebMCP tools arrive at runtime with JSON Schema inputs. `dynamicTool` exists for "tools loaded from external sources" and types the input as `unknown`, which we validate ourselves.[1]
- Name tools by Lane (for example `webmcp_<name>`) so they cannot collide with Browser tools. Our own convention, not a library rule.

### Screenshots in tool results
- The AI SDK docs say multi-modal tool results such as screenshots go back to the model through `toModelOutput`.[1]
- Both providers accept images inside tool results natively: Anthropic `tool_result` content blocks can be `text`, `image`, `document`, or `search_result`[6]. OpenAI function outputs can be an array of image or file objects instead of a string.[9]
- Anthropic rejects oversized `tool_result` images for computer/browser-use toolsets instead of downscaling them, so we resize screenshots before returning them.[8] We use plain function tools, not those toolsets, but resizing still controls cost.

### Usage fidelity
- The AI SDK step result exposes `usage.inputTokenDetails.{noCacheTokens, cacheReadTokens, cacheWriteTokens}`, `usage.outputTokenDetails.{textTokens, reasoningTokens}`, and `usage.raw` (the provider's original usage).[2]
- Normalization (read from `@ai-sdk/anthropic` 4.0.80 and `@ai-sdk/openai` 4.0.94 source):
  - Anthropic: `inputTokens` = `input_tokens + cache_creation + cache_read`; `noCacheTokens` = `input_tokens`; reasoning = `output_tokens_details.thinking_tokens`.
  - OpenAI Responses: `inputTokens` = `input_tokens` (already includes cached); `noCacheTokens` = input - cached - cache_write; reasoning = `reasoning_tokens`.
  - Cost code can therefore use one formula: `noCache * in + cacheRead * cacheReadPrice + cacheWrite * cacheWritePrice + output * out`.
- Anthropic bills 5-minute and 1-hour cache writes at different rates.[7] The AI SDK only reports the write total, so read the split from `usage.raw.cache_creation` when 1h caching is used (raw passthrough confirmed in source, not yet exercised live).
- Neither provider reports image tokens as a separate field. Image tokens are included in input tokens, so we record an **estimate** per screenshot:
  - Anthropic: `ceil(w/28) * ceil(h/28)` visual tokens after model-specific downscaling.[8]
  - OpenAI: patch- or tile-based rules that depend on model and `detail`.[11]

### Loop control
- The AI SDK documents a manual loop: call `generateText`/`streamText` in your own `while (step < maxSteps)` and append `response.messages`.[3]
- We use that loop with one `streamText` call per step. It gives exact step counting, a hard cap, one log record per model call, per-Lane abort, and a point to prune old screenshots between steps.
- The built-in alternative (`stopWhen: isStepCount(n)` + `prepareStep` + `onStepEnd`) also works and type-checks. `onStepFinish` is deprecated in favor of `onStepEnd`.[2]

### Streaming
- `streamText().fullStream` yields text deltas, tool calls, tool results, and step-finish parts with usage, which we forward to the UI over our own SSE/WebSocket.

### API keys
- Build the provider per Run from the key the user entered: `createAnthropic({ apiKey })`[4], `createOpenAI({ apiKey })`.[5]
- Do not use bare string model ids such as `"anthropic/claude-..."`: they go through the global default provider (Vercel AI Gateway), not the user's key (unverified in the v7 docs, consistent with v5/v6 behavior).

## Sketch (type-checked, not executed)

```ts
import { streamText, dynamicTool, jsonSchema, type ModelMessage, type ToolSet } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

const model = provider === 'anthropic'
  ? createAnthropic({ apiKey })(modelId)
  : createOpenAI({ apiKey }).responses(modelId);

const tools: ToolSet = {
  screenshot: dynamicTool({
    description: 'Screenshot the current page',
    inputSchema: jsonSchema({ type: 'object', properties: {} }),
    execute: async () => ({ base64: await takeScreenshot() }),
    toModelOutput: ({ output }) => ({
      type: 'content',
      value: [{ type: 'image-data', data: (output as { base64: string }).base64, mediaType: 'image/png' }],
    }),
  }),
  // WebMCP lane only: one dynamicTool per discovered tool, inputSchema: jsonSchema(t.inputSchema)
};

const messages: ModelMessage[] = [{ role: 'user', content: prompt }];
for (let step = 0; step < MAX_STEPS; step++) {
  const r = streamText({ model, tools, messages }); // default stopWhen = 1 step
  for await (const part of r.fullStream) emitToUi(lane, step, part);
  const usage = await r.usage; // includes cache read/write, reasoning, raw
  logStep({ lane, step, usage, raw: usage.raw, imageTokensEstimate });
  messages.push(...(await r.response).messages);
  if ((await r.finishReason) !== 'tool-calls') break;
}
```

## Risks

- **API churn.** v5, v6, and v7 all shipped within about a year (`ai` 7.0.0 on 2026-06-25, 312 v7 releases since[16]), and some names were renamed (`onStepFinish` to `onStepEnd`, `stepCountIs` to `isStepCount`). Pin exact versions and upgrade on purpose.
- **Abstraction lag.** New provider usage fields can reach the official SDKs before the AI SDK normalizes them. Always log `usage.raw` next to the normalized fields so cost can be recomputed later.
- **OpenAI cache-write tokens** are reported only for GPT-5.6 and later models.[5] Older models report `undefined`, which we record as unknown, not 0.

## Unverified

- Live API runs: only type-checks were done. Usage numbers and image-in-tool-result round trips still need one real call per provider in the first build ticket.
- Mastra: per-request API keys and usage passthrough.
- OpenAI Agents SDK: Anthropic image tool results and cache fields through the `aisdk` adapter.
- LangChain.js: OpenAI cache-write mapping.
- String model ids defaulting to the AI Gateway in v7.

## Method

- Docs: AI SDK, Anthropic, OpenAI, OpenAI Agents SDK, Mastra, LangChain.js (see Sources).
- npm metadata for current versions and release dates. GitHub API for repo activity.
- Spike in a scratch directory (not committed): `ai` 7.0.141, `@ai-sdk/anthropic` 4.0.80, `@ai-sdk/openai` 4.0.94, `@anthropic-ai/sdk` 0.134.0, `openai` 7.34.0, `@openai/agents` 0.20.0, TypeScript 7.0.2.
  - `tsc --noEmit --strict` passed for: dynamic JSON Schema tools, an image tool result through `toModelOutput`, per-request keys, `isStepCount` + `prepareStep` + `onStepEnd`, and reading `cacheReadTokens`/`cacheWriteTokens`/`reasoningTokens`/`raw`.
  - Usage mappings and tool-result image conversion were read from the installed provider source.

## Sources

[1] AI SDK: Tool Calling. https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
[2] AI SDK: generateText reference. https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
[3] AI SDK: Loop Control. https://ai-sdk.dev/docs/agents/loop-control
[4] AI SDK: Anthropic provider. https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
[5] AI SDK: OpenAI provider. https://ai-sdk.dev/providers/ai-sdk-providers/openai
[6] Anthropic: Handle tool calls. https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
[7] Anthropic: Prompt caching. https://platform.claude.com/docs/en/build-with-claude/prompt-caching
[8] Anthropic: Vision. https://platform.claude.com/docs/en/build-with-claude/vision
[9] OpenAI: Function calling. https://developers.openai.com/api/docs/guides/function-calling
[10] OpenAI: Prompt caching. https://developers.openai.com/api/docs/guides/prompt-caching
[11] OpenAI: Images and vision. https://developers.openai.com/api/docs/guides/images-vision
[12] OpenAI Agents SDK: AI SDK integration. https://openai.github.io/openai-agents-js/extensions/ai-sdk/
[13] Mastra: Agents overview. https://mastra.ai/docs/agents/overview
[14] LangChain.js: Models (token usage). https://docs.langchain.com/oss/javascript/langchain/models
[15] vercel/ai repository. https://github.com/vercel/ai
[16] npm: ai. https://www.npmjs.com/package/ai
