# webMCP-comparer

Runs the same Scenario on the same website in two Lanes side by side, a Baseline lane without WebMCP and a WebMCP lane with the site's WebMCP tools, and compares time, Steps, tokens, cost, tool calls and screenshots. See [docs/spec.md](docs/spec.md) and [GLOSSARY.md](GLOSSARY.md).

## Quickstart

Needs Node 24 or newer. [`just`](https://github.com/casey/just) is optional; every recipe wraps an npm script.

| npm                                             | just                | What it does                                     |
| ----------------------------------------------- | ------------------- | ------------------------------------------------ |
| `npm ci && npx playwright install chromium`     | `just install`      | Install dependencies and Chromium                |
| `npm run dev`                                   | `just dev`          | App on :3000 and demo shop on :4000, live reload |
| `npm start`                                     | `just start`        | Production build, then both servers              |
| `npm run demo`                                  | `just demo`         | Demo shop only, on :4000                         |
| `npm run lint && npm run typecheck && npm test` | `just check`        | Lint, typecheck and test                         |
| `npm run prices:check`                          | `just prices-check` | Compare the price table with the official pages  |

Then open http://localhost:3000.

API keys can be pasted in the UI or put in `.env` (copy `.env.example`).

## Prices

Cost is approximate: token buckets times the rates in [`server/pricing/prices.json`](server/pricing/prices.json), a dated copy of the official pricing pages (USD per million tokens). To use other rates, for example a negotiated discount, create `~/.webmcp-comparer/prices.json` with only the values to change; it is deep merged over the bundled table:

```json
{
  "providers": {
    "anthropic": {
      "models": { "claude-haiku-5-5": { "tiers": { "standard": { "rates": { "input": 0.08 } } } } }
    }
  }
}
```

`npm run prices:check` compares the bundled table with the official pricing pages and prints every difference. It never writes files; update `prices.json` by hand.
