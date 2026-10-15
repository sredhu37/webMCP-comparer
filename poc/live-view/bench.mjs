// Live-view benchmark: two Lanes (two Chrome instances), three streaming modes.
// Usage: node bench.mjs [--headed] [--seconds=10] [--channel=chromium]
// Prints fps, avg frame size and CPU seconds (Chrome processes + Node) per mode.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const SECONDS = Number(args.seconds ?? 10);
const HEADLESS = !args.headed;
const CHANNEL = args.channel; // e.g. 'chromium' for new headless, undefined = headless shell

// Busy page: CSS animation + DOM text updated every 100 ms (worst case for a stream).
const BUSY = 'data:text/html,' + encodeURIComponent(`
<style>@keyframes s{to{transform:rotate(360deg)}} .b{width:200px;height:200px;background:linear-gradient(red,blue);animation:s 2s linear infinite;margin:40px}</style>
<h1 id=t>0</h1><div class=b></div><p>${'lorem ipsum '.repeat(300)}</p>
<script>let n=0;setInterval(()=>t.textContent=++n,100)</script>`);
// Static page: nothing repaints after load.
const STATIC = 'data:text/html,' + encodeURIComponent(`<h1>static</h1><p>${'lorem ipsum '.repeat(300)}</p>`);

function chromeCpuSeconds() {
  // Sum cumulative CPU time of every process launched from the Playwright browser cache.
  const out = execSync('ps -A -o time=,command=', { encoding: 'utf8', maxBuffer: 64 << 20 });
  let total = 0;
  for (const line of out.split('\n')) {
    if (!line.includes('ms-playwright')) continue;
    const t = line.trim().split(/\s+/)[0];
    const parts = t.split(/[:-]/).map(Number);
    let s = 0;
    for (const p of parts) s = s * 60 + p; // [[d-]hh:]mm:ss.xx (days ignored, short runs)
    total += s;
  }
  return total;
}

async function launchLanes(url) {
  const lanes = [];
  for (const name of ['baseline', 'webmcp']) {
    const browser = await chromium.launch({ headless: HEADLESS, channel: CHANNEL });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url);
    lanes.push({ name, browser, page, frames: 0, bytes: 0 });
  }
  return lanes;
}

const modes = {
  async none() { return async () => {}; },

  // Playwright 1.59+ high level API.
  async pwScreencast(lanes) {
    for (const l of lanes) {
      await l.page.screencast.start({
        size: { width: 800, height: 800 },
        quality: 60,
        onFrame: ({ data }) => { l.frames++; l.bytes += data.length; },
      });
    }
    return async () => { for (const l of lanes) await l.page.screencast.stop(); };
  },

  // Raw CDP via CDPSession.
  async cdpScreencast(lanes) {
    for (const l of lanes) {
      const s = await l.page.context().newCDPSession(l.page);
      l.cdp = s;
      s.on('Page.screencastFrame', ({ data, sessionId }) => {
        l.frames++; l.bytes += Math.floor(data.length * 3 / 4);
        s.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      });
      await s.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 800, maxHeight: 800, everyNthFrame: 1 });
    }
    return async () => { for (const l of lanes) { await l.cdp.send('Page.stopScreencast'); await l.cdp.detach(); } };
  },

  // Raw CDP, capped at ~10 fps by delaying the ack (maxFramesInFlight=1).
  async cdpAck10fps(lanes) {
    for (const l of lanes) {
      const s = await l.page.context().newCDPSession(l.page);
      l.cdp = s;
      s.on('Page.screencastFrame', ({ data, sessionId }) => {
        l.frames++; l.bytes += Math.floor(data.length * 3 / 4);
        setTimeout(() => s.send('Page.screencastFrameAck', { sessionId }).catch(() => {}), 100);
      });
      await s.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 800, maxHeight: 800, maxFramesInFlight: 1 });
    }
    return async () => { for (const l of lanes) { await l.cdp.send('Page.stopScreencast'); await l.cdp.detach(); } };
  },

  // Raw CDP, everyNthFrame=6 (about 10 fps at 60 Hz).
  async cdpEvery6(lanes) {
    for (const l of lanes) {
      const s = await l.page.context().newCDPSession(l.page);
      l.cdp = s;
      s.on('Page.screencastFrame', ({ data, sessionId }) => {
        l.frames++; l.bytes += Math.floor(data.length * 3 / 4);
        s.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      });
      await s.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 800, maxHeight: 800, everyNthFrame: 6 });
    }
    return async () => { for (const l of lanes) { await l.cdp.send('Page.stopScreencast'); await l.cdp.detach(); } };
  },

  // Poll page.screenshot at a fixed rate on a separate CDP session (5 fps target).
  async poll5fps(lanes) {
    let stop = false;
    const loops = lanes.map(async l => {
      const s = await l.page.context().newCDPSession(l.page);
      while (!stop) {
        const t0 = Date.now();
        const { data } = await s.send('Page.captureScreenshot', { format: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: 1280, height: 800, scale: 0.625 } });
        l.frames++; l.bytes += Math.floor(data.length * 3 / 4);
        await new Promise(r => setTimeout(r, Math.max(0, 200 - (Date.now() - t0))));
      }
      await s.detach();
    });
    return async () => { stop = true; await Promise.all(loops); };
  },
};

async function runMode(mode, url) {
  const lanes = await launchLanes(url);
  await new Promise(r => setTimeout(r, 1000));
  const stopFn = await modes[mode](lanes);
  const cpu0 = chromeCpuSeconds();
  const node0 = process.cpuUsage();
  const t0 = Date.now();
  for (const l of lanes) { l.frames = 0; l.bytes = 0; }
  await new Promise(r => setTimeout(r, SECONDS * 1000));
  const dt = (Date.now() - t0) / 1000;
  const cpu1 = chromeCpuSeconds();
  const nodeCpu = process.cpuUsage(node0);
  const snapshot = lanes.map(l => ({ frames: l.frames, bytes: l.bytes }));

  // Interference check: agent-style screenshots while the stream is still running.
  const shotTimes = [];
  const framesBeforeShots = lanes[0].frames;
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await lanes[0].page.screenshot({ type: 'jpeg', quality: 60 });
    shotTimes.push(Date.now() - t);
  }
  const streamFramesDuringShots = lanes[0].frames - framesBeforeShots;
  await stopFn();
  for (const l of lanes) await l.browser.close();

  const frames = snapshot.reduce((a, l) => a + l.frames, 0);
  const bytes = snapshot.reduce((a, l) => a + l.bytes, 0);
  return {
    mode,
    page: url === BUSY ? 'busy' : 'static',
    fpsPerLane: +(frames / 2 / dt).toFixed(1),
    avgFrameKB: frames ? +(bytes / frames / 1024).toFixed(1) : 0,
    kbpsPerLane: +(bytes / 2 / dt / 1024).toFixed(0),
    chromeCpuPct: +((cpu1 - cpu0) / dt * 100).toFixed(0),
    nodeCpuPct: +(((nodeCpu.user + nodeCpu.system) / 1e6) / dt * 100).toFixed(1),
    agentShotMs: shotTimes.join('/'),
    streamFramesDuring3Shots: streamFramesDuringShots,
  };
}

const results = [];
for (const url of [BUSY, STATIC]) {
  for (const mode of Object.keys(modes)) {
    const r = await runMode(mode, url);
    console.log(JSON.stringify(r));
    results.push(r);
  }
}
console.log(`\nheadless=${HEADLESS} channel=${CHANNEL ?? 'default (headless shell when headless)'} seconds=${SECONDS} os=${process.platform} pw=${(await import('playwright/package.json', { with: { type: 'json' } })).default.version}`);
console.table(results);
