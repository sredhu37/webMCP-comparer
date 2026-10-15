import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
setTimeout(() => process.exit(2), 80000).unref();
const urls = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--enable-features=WebMCP'] });
const out = { playwright: '1.64.1', browserVersion: browser.version(), date: new Date().toISOString(), sites: [] };
for (const url of urls) {
  const page = await browser.newPage();
  const entry = { url };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const tools = await page.webmcp.tools();
    entry.tools = tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  } catch (e) { entry.error = String(e.message).split('\n')[0]; }
  out.sites.push(entry);
  await page.close();
}
await browser.close();
writeFileSync('results/real-sites.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.sites.map(s => ({ url: s.url, error: s.error, tools: s.tools?.map(t => t.name) })), null, 1));
