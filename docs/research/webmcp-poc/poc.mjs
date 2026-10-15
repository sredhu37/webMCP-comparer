// WebMCP x Playwright proof of concept.
// Usage: node poc.mjs <config>   (one config per process; see CONFIGS)
// Writes results/<config>.json (also after every step, so a hard kill keeps partial results).
// Run with a hard wall clock kill on macOS (no `timeout` binary):
//   perl -e 'alarm 90; exec @ARGV' node poc.mjs headless-shell
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const FLAG = '--enable-features=WebMCP';
const T = 8000; // explicit timeout for every Playwright call (webmcp calls default to 0 = infinite)

const CONFIGS = {
  // Default headless = chromium-headless-shell.
  'headless-shell': { headless: true, args: [FLAG] },
  // New headless mode of the full Chromium build.
  'headless-new': { headless: true, channel: 'chromium', args: [FLAG] },
  headed: { headless: false, args: [FLAG] },
  // Branded Google Chrome stable installed on the machine (if any).
  'chrome-stable-headless': { headless: true, channel: 'chrome', args: [FLAG] },
  // No flag: does page.webmcp work at all, and does the @mcp-b/global polyfill show up?
  'no-flag': { headless: true, args: [] },
};

const name = process.argv[2];
if (!CONFIGS[name]) { console.error(`usage: node poc.mjs <${Object.keys(CONFIGS).join('|')}>`); process.exit(1); }
const killer = setTimeout(() => { console.error('\nwall clock exceeded, exiting'); process.exit(2); }, 80000);

const resultFile = path.join(here, 'results', `${name}.json`);
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
const out = { config: name, launch: CONFIGS[name], playwright: null, node: process.version, date: new Date().toISOString() };
const save = () => fs.writeFileSync(resultFile, JSON.stringify(out, null, 2) + '\n');

function serve() {
  const routes = { '/vendor/mcp-b-global.iife.js': path.join(here, 'node_modules/@mcp-b/global/dist/index.iife.js') };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = routes[url.pathname] ?? path.join(here, 'site', url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(here) || !fs.existsSync(file)) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

let step = 0;
async function attempt(fn) {
  const t0 = Date.now();
  process.stderr.write(`.${++step}`);
  let r;
  try { r = { ok: true, value: await fn(), ms: Date.now() - t0 }; }
  catch (e) { r = { ok: false, error: String(e?.message ?? e).split('\n')[0], ms: Date.now() - t0 }; }
  return r;
}
const names = (r) => (r.ok && Array.isArray(r.value) ? { ...r, value: r.value.map((t) => t.name) } : r);
async function rec(key, fn) { out[key] = await attempt(fn); save(); return out[key]; }

out.playwright = JSON.parse(fs.readFileSync(path.join(here, 'node_modules/playwright/package.json'), 'utf8')).version;
const server = await serve();
const base = `http://localhost:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ ...CONFIGS[name], timeout: 30000 });
  out.browserVersion = browser.version();
  const page = await browser.newPage();
  page.setDefaultTimeout(T);
  page.setDefaultNavigationTimeout(T);
  out.userAgent = await page.evaluate(() => navigator.userAgent);
  out.headlessInUA = /Headless/.test(out.userAgent);
  save();

  // 1. Main page with imperative + declarative tools and three iframes.
  await rec('gotoIndex', () => page.goto(`${base}/index.html`, { waitUntil: 'load' }).then((r) => r?.status()));
  await rec('mainWorld', () => page.evaluate(() => {
    const mc = document.modelContext || navigator.modelContext;
    return {
      documentModelContext: 'modelContext' in document,
      navigatorModelContext: 'modelContext' in navigator,
      ctor: mc?.constructor?.name ?? null,
      methods: mc ? Object.getOwnPropertyNames(Object.getPrototypeOf(mc)).filter((k) => k !== 'constructor').sort() : null,
    };
  }));
  await rec('toolsImmediately', () => page.webmcp.tools({ timeout: T }));
  await page.waitForTimeout(1500);
  await rec('toolsAfter1500ms', () => page.webmcp.tools({ timeout: T }));

  const call = (tool, input, timeout = T) => () => page.webmcp.callTool(tool, input, { timeout });
  out.call = {};
  for (const [k, fn] of Object.entries({
    add: call('add', { a: 2, b: 40 }),
    greet: call('greet', { who: 'pw' }),
    returns_object: call('returns_object', {}),
    is_error: call('is_error', {}),
    throws: call('throws', {}),
    unknown: call('nope', {}),
    add_bad_input: call('add', { a: 'x' }, 5000),
    late_tool: call('late_tool', {}),
    dom_click: call('dom_click', {}),
    search_products_autosubmit: call('search_products', { query: 'dune', category: 'books' }, 5000),
    contact_us_no_autosubmit: call('contact_us', { email: 'a@b.c' }, 3000),
  })) { out.call[k] = await attempt(fn); save(); }
  await rec('urlAfterCalls', async () => page.url());
  await rec('pageLogAfterCalls', () => page.locator('#log').textContent({ timeout: T }));
  await rec('contactFieldValue', () => page.locator('#contact input[name=email]').inputValue({ timeout: T }));

  // 2. Frames: page.webmcp is main frame only; each frame has its own frame.webmcp.
  out.frames = [];
  for (const f of page.frames()) out.frames.push({ url: f.url(), tools: names(await attempt(() => f.webmcp.tools({ timeout: T }))) });
  save();
  const xo = page.frames().find((f) => f.url().includes('xo_allowed_tool'));
  out.call.xo_allowed_tool_via_frame = await attempt(() => xo.webmcp.callTool('xo_allowed_tool', {}, { timeout: T }));
  out.call.child_tool_via_page = await attempt(call('child_tool', {}));
  await rec('mainWorldGetTools', () => page.evaluate(async () => {
    const mc = document.modelContext || navigator.modelContext;
    if (!mc?.getTools) return 'no getTools in main world';
    return (await mc.getTools()).map((t) => `${t.name}@${t.origin ?? '?'}`);
  }));

  // 3. Navigation triggered by a tool.
  out.call.go_page2 = await attempt(call('go_page2', {}, 5000));
  await rec('waitForPage2', () => page.waitForURL('**/page2.html', { timeout: T, waitUntil: 'load' }));
  await rec('urlAfterGoPage2', async () => page.url());
  out.toolsAfterToolNavigation = names(await attempt(() => page.webmcp.tools({ timeout: T }))); save();

  // 4. No tools registered.
  await rec('gotoEmpty', () => page.goto(`${base}/empty.html`).then((r) => r?.status()));
  await rec('toolsOnEmptyPage', () => page.webmcp.tools({ timeout: T }));
  out.call.onEmptyPage = await attempt(call('add', { a: 1, b: 1 }));

  // 5. Tool list after goto / goBack.
  await rec('gotoPage2', () => page.goto(`${base}/page2.html`).then((r) => r?.status()));
  out.toolsAfterGotoPage2 = names(await attempt(() => page.webmcp.tools({ timeout: T }))); save();
  await rec('goBack', () => page.goBack({ timeout: T }).then((r) => r?.url()));
  out.toolsAfterGoBackToEmpty = names(await attempt(() => page.webmcp.tools({ timeout: T }))); save();

  // 6. @mcp-b/global polyfill page.
  await rec('gotoPolyfill', () => page.goto(`${base}/polyfill.html`).then((r) => r?.status()));
  await page.waitForTimeout(500);
  out.polyfill = {
    mainWorld: await attempt(() => page.evaluate(async () => {
      const mc = document.modelContext || navigator.modelContext;
      let listed = null;
      try { listed = mc?.listTools ? mc.listTools().map((t) => t.name) : null; } catch (e) { listed = 'err ' + e.message; }
      return { hasDocMC: !!document.modelContext, hasNavMC: !!navigator.modelContext, ctor: mc?.constructor?.name, sameObj: document.modelContext === navigator.modelContext, listTools: listed };
    })),
    pwTools: names(await attempt(() => page.webmcp.tools({ timeout: T }))),
    pwCall: await attempt(() => page.webmcp.callTool('poly_tool', { x: 7 }, { timeout: 5000 })),
  };
  save();
} catch (e) {
  out.fatal = String(e?.message ?? e).split('\n')[0];
  save();
} finally {
  await browser?.close().catch(() => {});
  server.close();
  clearTimeout(killer);
}
console.log(`\n=== ${name} ===\n` + JSON.stringify(out, null, 2));
process.exit(0);
