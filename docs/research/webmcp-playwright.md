# Research: WebMCP in Playwright

Issue: #4 (parent #1). Verified: 2026-10-15 on macOS (M1 Pro), Node v26.7.0, Playwright 1.64.1.

## Answer (short)

- Playwright 1.64+ exposes WebMCP through `page.webmcp.tools()` and `page.webmcp.callTool(name, input, { timeout })`. Chromium must be launched with `--enable-features=WebMCP`.[1]
- It works identically in **headless shell, new headless, headed, and stable Chrome headless**. Headless is therefore safe for the WebMCP lane and for the screencast live view.
- **Real sites need no origin trial token** when the flag is on: Google's live demos exposed their tools headless (see PoC 3).
- `callTool` defaults to **no timeout**. Declarative form tools without auto-submit never resolve. Always pass a timeout.
- `page.webmcp` covers the **main frame only**; iframe tools need `frame.webmcp`.

## 1. PoC results

Source: `docs/research/webmcp-poc/` (`poc.mjs`, `realsite.mjs`, `site/`, raw output in `results/*.json`).

### PoC 1: launch configurations

| Config | Browser | `document.modelContext` | `tools()` / `callTool()` |
| --- | --- | --- | --- |
| headless shell (default) | Chromium 156.0.8078.4 | yes | works |
| new headless (`channel: 'chromium'`) | Chromium 156.0.8078.4 | yes | works |
| headed | Chromium 156.0.8078.4 | yes | works |
| stable Chrome headless (`channel: 'chrome'`) | Chrome 155.0.8059.40 | yes | works |
| no flag | Chromium 156.0.8078.4 | no | throws `WebMCP is not enabled. Launch the browser with the "--enable-features=WebMCP" argument.` |

- The API lives on `document.modelContext` (methods `registerTool`, `getTools`, `executeTool`, `ontoolchange`, plus `ontoolactivated` / `ontoolcancel` on 156). `navigator.modelContext` is absent.

### PoC 2: behaviour (same result in all four enabled configs)

| Case | Result |
| --- | --- |
| Tool descriptor | `{ name, description, inputSchema?, annotations? }`. Declarative forms get a generated JSON Schema (enum + anyOf from `<select>`). Annotations seen: `readOnly`, `untrustedContent`, `consequential`. |
| Tools available right after `goto` | yes, including declarative forms |
| Tool registered later (`late_tool`) | listed and callable once registered |
| MCP-style result | returned as is: `{ content: [{ type: 'text', text: '42' }] }` |
| Plain string / object result | returned as is (`"hello pw"`, `{ ok: true, items: [1, 2] }`): results are not normalized |
| `isError: true` result | returned as a value, does not throw |
| `execute` throws | throws `UnknownError: Tool was executed but the invocation failed` |
| Unknown tool | throws, and the message lists available tool names |
| Bad input (schema mismatch) | **not validated**: tool ran with `undefined` and returned `xundefined` |
| Declarative form, `toolautosubmit` | form filled and submitted, page sees `agentInvoked=true`, result returned |
| Declarative form, no auto-submit | form fields filled, then **hangs** until the `callTool` timeout (3000 ms in PoC) |
| Tool that navigates (`go_page2`) | returns, page navigates, `tools()` then lists the new page's tools only |
| Page with no tools | `tools()` returns `[]`; `callTool` throws `The frame does not register any WebMCP tools.` |
| Same-origin iframe tool | not in `page.webmcp.tools()`; listed by `frame.webmcp.tools()`; in-page `getTools()` does include it |
| Cross-origin iframe, `allow="tools"` | available via `frame.webmcp` |
| Cross-origin iframe, default policy | `NotAllowedError: Access to the feature "tools" is disallowed by permissions policy` |
| `@mcp-b/global` 6.0.3 polyfill, flag on | polyfill defers to native; Playwright lists and calls `poly_tool` |
| Polyfill, flag off | tool exists in page (`document.modelContext.getTools()`), but Playwright's API refuses (`WebMCP is not enabled`) |

### PoC 3: real sites (headless, flag on, no origin trial token)

| URL | Tools found |
| --- | --- |
| googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/ | `add_topping`, `manage_pizza`, `remove_topping`, `set_pizza_size`, `set_pizza_style`, `share_pizza`, `toggle_layer` |
| googlechromelabs.github.io/webmcp-tools/demos/french-bistro/ | `book_table_le_petit_bistro` (declarative) |
| example.com | none (`[]`) |

## 2. Docker (documentation only, not tested: Docker is not installed on this Mac)

- The official image `mcr.microsoft.com/playwright:v1.64.0-noble` ships the Playwright browsers and system dependencies; the Playwright npm package is installed separately.[2] WebMCP is a Chromium feature flag, not an OS dependency, so it is expected to work with the same launch argument. **Unverified** until a container run.
- Playwright warns the image is not recommended for untrusted websites as root, and recommends a separate user plus the provided seccomp profile for crawling, and `--init` / `--ipc=host`.[2] Users will point this tool at arbitrary sites, so the Dockerfile should follow the non-root + seccomp setup.
- Headless works for WebMCP (PoC 1), so the container needs no display server.

## 3. Implications for the WebMCP lane

1. Launch both Lanes' Chromium with `--enable-features=WebMCP`. The flag only exposes tools to the WebMCP lane's agent if we pass them, so fairness holds; launching both identically also keeps rendering identical.
2. Re-read `tools()` after every agent step (cheap, about 1 to 3 ms), because navigation and late registration change the tool set. Rebuild the agent's WebMCP tool list per step and log changes.
3. Always call `callTool` with an explicit timeout (suggest 15 s) and map timeout, throw, unknown tool and `isError` to distinct tool-result outcomes in the logs.
4. Validate inputs against `inputSchema` ourselves before calling (Chromium does not), or at least record schema violations.
5. Normalize results for the model: MCP `content` arrays pass through; strings and objects get wrapped as text.
6. Declarative forms without auto-submit only fill fields; the agent must then submit with a Browser tool. Tool descriptions should not hide this; consider noting it in the system prompt.
7. Scope: main frame tools via `page.webmcp`. Iframe tools via `frame.webmcp` are an optional extension (fog for the spec).
8. Polyfill-only sites (no native registration while the flag is on) are covered, because the polyfill defers to native when the flag is set. Sites must not be tested with the flag off.
9. Pre-flight check per Suite: open the URL, list tools, and warn in the UI if the WebMCP lane would have zero WebMCP tools (the comparison would be meaningless).

## Sources

1. Playwright, WebMCP class: https://playwright.dev/docs/api/class-webmcp
2. Playwright, Docker: https://playwright.dev/docs/docker
3. Chrome for Developers, WebMCP: https://developer.chrome.com/docs/ai/webmcp
4. WebMCP-org, `@mcp-b/global` README: https://github.com/WebMCP-org/npm-packages/blob/main/packages/global/README.md
5. GoogleChromeLabs WebMCP demos: https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos
