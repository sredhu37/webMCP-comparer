// Live-view PoC: two Lanes stream into one web page over a single WebSocket.
// Usage: node server.mjs [--selftest]   then open http://localhost:5173
// Wire format: binary message = 1 byte lane index (0 Baseline, 1 WebMCP) + JPEG bytes.
import { chromium } from 'playwright';
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = 5173;
const LANES = ['Baseline lane', 'WebMCP lane'];
const SITES = ['https://example.com', 'https://www.wikipedia.org'];

const html = `<!doctype html><meta charset=utf-8><title>live view</title>
<style>body{margin:0;display:flex;gap:8px;background:#111;color:#ddd;font:14px sans-serif}
figure{margin:8px;flex:1} canvas{width:100%;background:#000}</style>
${LANES.map((n, i) => `<figure><figcaption>${n} <span id=f${i}>0</span> frames</figcaption><canvas id=c${i}></canvas></figure>`).join('')}
<script>
const counts=[0,0];
const ws=new WebSocket('ws://'+location.host);
ws.binaryType='arraybuffer';
ws.onmessage=async e=>{
  const lane=new Uint8Array(e.data,0,1)[0];
  const bmp=await createImageBitmap(new Blob([new Uint8Array(e.data,1)],{type:'image/jpeg'}));
  const c=document.getElementById('c'+lane);
  if(c.width!==bmp.width){c.width=bmp.width;c.height=bmp.height}
  c.getContext('2d').drawImage(bmp,0,0); bmp.close();
  document.getElementById('f'+lane).textContent=++counts[lane];
  window.__counts=counts;
};
</script>`;

const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html); });
const wss = new WebSocketServer({ server });
const lastFrame = [null, null]; // latest frame per Lane, replayed to late joiners

function broadcast(lane, jpeg) {
  const msg = Buffer.concat([Buffer.from([lane]), jpeg]);
  lastFrame[lane] = msg;
  for (const ws of wss.clients) {
    // Latest-frame-wins backpressure: skip this frame for a slow client.
    if (ws.readyState === 1 && ws.bufferedAmount < 1 << 20) ws.send(msg);
  }
}
wss.on('connection', ws => { for (const m of lastFrame) if (m) ws.send(m); });

await new Promise(r => server.listen(PORT, r));
console.log(`viewer: http://localhost:${PORT}`);

const lanes = [];
for (let i = 0; i < LANES.length; i++) {
  const browser = await chromium.launch(); // headless; same code works headed
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // Stream is UI-only: it never touches the agent's screenshot tool or its counter.
  await page.screencast.start({ size: { width: 800, height: 800 }, quality: 60, onFrame: ({ data }) => broadcast(i, data) });
  lanes.push({ browser, page, frames: 0 });
}
if (process.argv.includes('--selftest')) {
  // Open the viewer in a separate browser and drive both Lanes through cross-site navigations.
  const viewerBrowser = await chromium.launch();
  const viewer = await viewerBrowser.newPage();
  await viewer.goto(`http://localhost:${PORT}`);
  const report = [];
  for (const url of ['data:text/html,<h1>start</h1>', ...SITES]) {
    const before = await viewer.evaluate(() => [...(window.__counts ?? [0, 0])]);
    await Promise.all(lanes.map(l => l.page.goto(url)));
    await Promise.all(lanes.map(l => l.page.mouse.wheel(0, 400))); // force repaints
    await viewer.waitForTimeout(1500);
    const after = await viewer.evaluate(() => [...(window.__counts ?? [0, 0])]);
    report.push({ url, viewerFramesBaseline: after[0] - before[0], viewerFramesWebMCP: after[1] - before[1] });
  }
  console.table(report);
  await viewer.screenshot({ path: 'viewer.png' });
  await viewerBrowser.close();
  for (const l of lanes) await l.browser.close();
  server.close();
  process.exit(0);
}
