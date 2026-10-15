# Research: live view of both Lanes' Chrome screens

Issue: [#3](https://github.com/sredhu37/webMCP-comparer/issues/3). Date: 2026-10-15. Playwright 1.64.1, Chromium 156.0.8078.4.

## Recommendation

Use **Playwright `page.screencast.start({ onFrame })`** (Playwright 1.59+, a wrapper over CDP `Page.startScreencast`) per Lane, run Chrome **headless**, and push JPEG frames from the Node backend to the web UI over **one WebSocket** as binary messages (`1 byte Lane id + JPEG`), drawn into a `<canvas>` per Lane.

- Keep raw CDP (`CDPSession` + `Page.startScreencast`) as the fallback if we need `maxFramesInFlight`, `everyNthFrame` or ack-based throttling that the Playwright API does not expose.
- Do not use periodic screenshots as the primary stream: constant CPU cost even on idle pages, and the polling sits on the same capture path as the agent's screenshot tool.
- Do not use VNC/noVNC: it needs headed Chrome on an X server (Xvfb + x11vnc + websockify) in Docker, extra ports and processes, and shows browser chrome we do not need. Keep it only as a manual debugging aid.

## Options compared

| | Playwright `page.screencast` / CDP `Page.startScreencast` | Periodic `Page.captureScreenshot` | VNC / noVNC |
|---|---|---|---|
| Headless | Yes (measured: headless shell and new headless) | Yes | No, needs a display (Xvfb in Docker) |
| Headed | Yes (measured on macOS) | Yes | Yes |
| Frame trigger | Damage-driven: frames only when the page repaints | Fixed timer | Damage-driven at X11 level |
| Idle cost | ~0 (no repaint, no frames) | Constant | Low, but Xvfb + VNC server always running |
| Busy-page cost | High at full rate (60 fps); must be capped | Bounded by poll rate | Encoding cost of whole X screen (unverified, not measured) |
| Transport to UI | Our WebSocket, JPEG frames | Our WebSocket, JPEG frames | RFB over WebSocket via websockify, separate port |
| Docker | Nothing extra; reuses the app's HTTP/WS port | Nothing extra | Xvfb, window manager, x11vnc, websockify, extra port |
| Agent screenshot count | Not affected (separate API, not a tool call) | Not affected if counted at the tool layer, but competes for the same capture call | Not affected |
| API status | CDP methods marked experimental; Playwright API stable since 1.59 | Stable | External tooling |

## Measurements (PoC)

`poc/live-view/bench.mjs`: two Lanes, two separate Chromium instances, viewport 1280x800, JPEG quality 60, frames max 800x800, 6-8 s per mode. Apple M1 Pro, 10 cores, macOS. "Busy" page = CSS animation + DOM update every 100 ms (worst case). "Static" page = no repaint after load. CPU % is summed across both Chrome instances (100 % = one core).

Headless (default headless shell):

| Mode | Page | fps per Lane | KB per frame | Chrome CPU % | Node CPU % |
|---|---|---|---|---|---|
| none | busy | 0 | - | 11 | 0 |
| `page.screencast` | busy | 60.4 | 71 | 99 | 7.7 |
| CDP screencast, ack every frame | busy | 60.4 | 71 | 93 | 7.0 |
| CDP screencast, ack delayed 100 ms, `maxFramesInFlight: 1` | busy | 8.6 | 71 | 63 | 1.3 |
| CDP screencast, `everyNthFrame: 6` | busy | 10 | 71 | 63 | 2.4 |
| poll `captureScreenshot` 5 fps | busy | 5 | 79 | 25 | 1.4 |
| none | static | 0 | - | 0 | 0 |
| `page.screencast` | static | 0.1 (one initial frame) | 68 | 0 | 0.1 |
| CDP screencast, `everyNthFrame: 6` | static | 0 (no initial frame) | - | 0 | 0.1 |
| poll `captureScreenshot` 5 fps | static | 5 | 75 | 19 | 0.9 |

New headless (`channel: 'chromium'`): same shape, lower Chrome CPU on busy page (57-61 % at 60 fps, 30 % at 10 fps). Headed (macOS, 120 Hz display): busy page streams at 93 fps per Lane, 94 % Chrome CPU; capped modes 59-65 %; static page again ~0.

Takeaways:

1. Agent pages are mostly static between actions, so the screencast costs close to nothing while the agent thinks. Polling pays every tick.
2. On a page that animates continuously, an uncapped screencast costs about one core for two Lanes. Capping the delivered fps reduces encoding and transfer but Chrome still renders and captures at display rate, so CPU drops less than fps does (93 % to 63 %).
3. A static page yields one frame at start and then nothing. `everyNthFrame > 1` can skip even that frame. The server must cache the last frame per Lane and replay it to new viewers.
4. Frames are 70-80 KB at 800 px, quality 60. Two Lanes at 10 fps is ~1.4 MB/s, fine on localhost.

End-to-end check (`poc/live-view/server.mjs --selftest`): both Lanes stream through a WebSocket into a viewer page with two canvases; frames kept arriving across cross-site navigations (data URL, example.com, wikipedia.org; 12-15 frames per Lane per step). Screenshot of the viewer: `poc/live-view/viewer.png`.

## Interference with the agent's screenshots

- **Count**: the stream never goes through the agent's screenshot tool, so a counter incremented inside that tool stays exact. Do not count screenshots from CDP traffic, Playwright traces or `Page.captureScreenshot` events: the stream and any poller would pollute those.
- **Latency**: agent `page.screenshot()` while streaming took about 33 ms typical (range 13-48 ms), same as without a stream (16-50 ms). First-call outliers (130 ms headed, 269 ms with no stream at all) appeared regardless of streaming. Polling at 5 fps pushed the first agent screenshot to 39-63 ms.
- **Side effect**: an agent screenshot forces a repaint, so the stream emits 1-12 extra frames around it (measured). Harmless for the UI; another reason not to derive counts from frames.
- **Content**: screencast frames are not injected into the page. Do not call `screencast.showActions()` / `showOverlay()` on Lane pages: those overlays render in the page and would appear in the agent's own screenshots (inferred from the docs, not tested).
- **Conflicts**: Playwright docs say an already active screencast (tracing or video recording) takes precedence over `page.screencast.start()` options. Avoid enabling trace screenshots or video on Lane pages, or accept their frame size.

## Headed vs headless

- Headless is the default for Docker and needs no display. Screencast works in both the headless shell (Playwright default) and new headless (`channel: 'chromium'`), measured.
- Headed is useful for local debugging on macOS but adds windows and follows display refresh (93 fps at 120 Hz). If a headed window is hidden, Chrome may stop producing frames; CDP exposes `Page.screencastVisibilityChanged` for this (not tested).
- Whether WebMCP itself works in headless mode is a separate question. Chrome's WebMCP docs say it "may be possible" in headless but is designed for local browser workflows (unverified for this app). The live view choice does not depend on it, since screencast works in all three modes.

## Docker implications

- Screencast: no extra packages, processes or ports. Frames travel over the app's existing HTTP/WebSocket port. Use the official image `mcr.microsoft.com/playwright:v1.64.0-noble` (or match the npm version) with `--init` and `--ipc=host` as Playwright recommends.
- VNC: needs Xvfb, a window manager, x11vnc and websockify in the image, headed Chrome, and a second exposed port. More moving parts for no measurement benefit.
- CPU figures above are from macOS on Apple Silicon. Docker on Linux without GPU uses software compositing; numbers there are unverified and likely higher on busy pages.

## Implementation notes

- Per Lane: `await page.screencast.start({ size: { width: 800, height: 800 }, quality: 60, onFrame })` right after page creation; `stop()` on Lane end.
- Server: keep `lastFrame[lane]`, send it on WebSocket connect; per client drop frames when `ws.bufferedAmount` exceeds ~1 MB (latest frame wins).
- Client: `ws.binaryType = 'arraybuffer'`, `createImageBitmap(new Blob([jpeg]))`, `drawImage` on a per-Lane canvas.
- If busy pages make CPU a problem, switch that Lane to raw CDP with `everyNthFrame` or delayed `Page.screencastFrameAck`, and always seed the first frame (e.g. a one-off stream-side `Page.captureScreenshot` that is not an agent tool call).
- Multiple pages per Lane (popups, new tabs): attach a screencast to the page the agent currently drives (follow-up for the Browser tools design).

## PoC

`poc/live-view/` (not production code): `bench.mjs` (measurements above, `--headed`, `--channel=chromium`, `--seconds=N`), `server.mjs` (two-Lane viewer on http://localhost:5173, `--selftest` for headless check). Run `npm install` there first; `node_modules` is not committed.

## Sources

- CDP Page domain, `Page.startScreencast` (`format`, `quality`, `maxWidth`, `maxHeight`, `everyNthFrame`, `maxFramesInFlight`, `sendLastFrame`), `Page.screencastFrame`, `Page.screencastFrameAck`, `Page.screencastVisibilityChanged`, `Page.captureScreenshot` (all marked experimental except captureScreenshot): https://chromedevtools.github.io/devtools-protocol/tot/Page/
- Playwright `Screencast` class (`start({ onFrame, size, quality, path })`, JPEG frames, default 800x800, active tracing/video config takes precedence): https://playwright.dev/docs/api/class-screencast
- Playwright 1.59 release notes (introduces `page.screencast`, real-time frame streaming): https://playwright.dev/docs/release-notes#version-159
- Playwright `CDPSession`: https://playwright.dev/docs/api/class-cdpsession
- Playwright browsers: headless shell vs new headless (`channel: 'chromium'`): https://playwright.dev/docs/browsers
- Playwright Docker (`--init`, `--ipc=host`, image tags, noVNC note): https://playwright.dev/docs/docker
- Chrome headless mode: https://developer.chrome.com/docs/chromium/headless
- noVNC (HTML VNC client over WebSockets): https://github.com/novnc/noVNC
- WebMCP in Chrome, headless limitation note: https://developer.chrome.com/docs/ai/webmcp
- npm registry: `playwright` latest 1.64.1 on 2026-10-15 (`npm view playwright version`).
