// PROTOTYPE: drives the demo shop in both Lane configurations to check the design.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 90000).unref();
const base = 'http://localhost:4100';
const server = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: '4100' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
mkdirSync('shots', { recursive: true });
const T = { timeout: 10000 };
const out = {};

try {
  // Baseline lane: WebMCP flag off.
  const off = await chromium.launch({ headless: true });
  const b = await (await off.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await b.goto(base + '/');
  out.baseline = {
    documentModelContext: await b.evaluate(() => Boolean(document.modelContext)),
    webmcpTools: await b.webmcp.tools().then((t) => t.map((x) => x.name), (e) => e.message.split('\n')[0]),
  };
  await b.screenshot({ path: 'shots/1-home-baseline.png' });
  await b.fill('input[name=query]', 'shirt'); await b.selectOption('select[name=color]', 'red'); await b.click('form.filters button');
  await b.waitForURL(/search/); await b.screenshot({ path: 'shots/2-search-red-shirts.png' });
  await b.click('text=Red shirt basic'); await b.selectOption('select[name=size]', 'M'); await b.click('text=Add to cart');
  await b.screenshot({ path: 'shots/3-product-added.png' });
  out.baseline.cartBadge = await b.textContent('#cart-link');
  await b.goto(base + '/cart'); await b.screenshot({ path: 'shots/4-cart.png' });
  await b.goto(base + '/checkout'); await b.screenshot({ path: 'shots/5-checkout.png' });
  await b.fill('#name', 'Jane Doe'); await b.fill('#email', 'jane@example.com'); await b.fill('#address', 'Hauptstr. 1, Düsseldorf');
  await b.click('text=Place order'); await b.waitForURL(/order/);
  out.baseline.orderPage = await b.textContent('h1');
  await b.screenshot({ path: 'shots/6-order-placed.png' });
  await off.close();

  // WebMCP lane: flag on.
  const on = await chromium.launch({ headless: true, args: ['--enable-features=WebMCP'] });
  const w = await (await on.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await w.goto(base + '/');
  out.webmcp = { toolsOnHome: (await w.webmcp.tools()).map((t) => t.name) };
  out.webmcp.search = await w.webmcp.callTool('search_products', { query: 'shirt', color: 'red' }, T);
  out.webmcp.addBadSize = await w.webmcp.callTool('add_to_cart', { productId: 'red-polo', size: 'M' }, T);
  out.webmcp.add = await w.webmcp.callTool('add_to_cart', { productId: 'red-shirt-basic', size: 'M' }, T);
  out.webmcp.cartBadgeAfterTool = await w.textContent('#cart-link');
  out.webmcp.urlAfterAdd = w.url();
  await w.goto(base + '/checkout?debug');
  out.webmcp.toolsOnCheckout = (await w.webmcp.tools()).map((t) => t.name);
  out.webmcp.checkoutSchema = (await w.webmcp.tools()).find((t) => t.name === 'checkout')?.inputSchema;
  await w.screenshot({ path: 'shots/7-checkout-webmcp-debug.png' });
  out.webmcp.checkout = await w.webmcp.callTool('checkout', { name: 'Jane Doe', email: 'jane@example.com', address: 'Hauptstr. 1, Düsseldorf' }, T)
    .catch((e) => e.message.split('\n')[0]);
  await w.waitForURL(/order/, T).catch(() => {});
  out.webmcp.orderPage = await w.textContent('h1');
  await on.close();
} finally {
  server.kill();
}
console.log(JSON.stringify(out, null, 1));
