import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { viteConfigFile } from './paths.ts';

/**
 * Smoke test of the web UI: a production build of web/ served by the real app server, in
 * headless Chromium. Set UI_SCREENSHOT=<path> to also save a screenshot of the page.
 */

interface PastRunFixture {
  id: string;
  startedAt: string;
  siteUrl: string;
  provider: 'anthropic' | 'openai';
  model: string;
  baseline: [pass: number, fail: number];
  webmcp: [pass: number, fail: number];
  stoppedByUser?: boolean;
}

const PAST_RUNS: PastRunFixture[] = [
  {
    id: '2026-10-15_14-30-05',
    startedAt: '2026-10-15T12:30:05.000Z',
    siteUrl: 'http://localhost:4000',
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    baseline: [3, 1],
    webmcp: [4, 0],
  },
  {
    id: '2026-10-15_11-02-41',
    startedAt: '2026-10-15T09:02:41.000Z',
    siteUrl: 'https://shop.example.com/de',
    provider: 'openai',
    model: 'gpt-6-luna',
    baseline: [1, 1],
    webmcp: [2, 0],
  },
  {
    id: '2026-10-14_17-45-12',
    startedAt: '2026-10-14T15:45:12.000Z',
    siteUrl: 'http://localhost:4000',
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    baseline: [0, 1],
    webmcp: [0, 1],
    stoppedByUser: true,
  },
];

async function writePastRun(runsDir: string, fixture: PastRunFixture): Promise<void> {
  const lane = ([pass, fail]: [number, number]) => ({ pass, fail });
  const results = {
    run: {
      id: fixture.id,
      startedAt: fixture.startedAt,
      endedAt: fixture.startedAt,
      durationMs: 60_000,
      siteUrl: fixture.siteUrl,
      provider: fixture.provider,
      model: fixture.model,
      effort: 'medium',
      attempts: 1,
      limits: { maxSteps: 50, maxDurationMs: 300_000, maxCostUsd: 2 },
      scenarioIds: ['cheapest-red-shirt-price'],
      priceTableVersion: 'test',
      priceTableOverride: null,
      systemPromptVersion: '1',
      stoppedByUser: fixture.stoppedByUser ?? false,
      error: null,
    },
    summary: { baseline: lane(fixture.baseline), webmcp: lane(fixture.webmcp) },
    scenarios: [],
    suite: {
      source: 'scenarios:\n  - id: cheapest-red-shirt-price\n    prompt: Hi\n',
      scenarios: [],
    },
  };
  await mkdir(join(runsDir, fixture.id), { recursive: true });
  await writeFile(join(runsDir, fixture.id, 'results.json'), JSON.stringify(results));
}

describe('web UI', () => {
  let app: FastifyInstance;
  let browser: Browser;
  let page: Page;
  let tmp: string;
  let url: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'webmcp-comparer-ui-'));
    const webDist = join(tmp, 'web');
    const runsDir = join(tmp, 'runs');
    await build({
      configFile: viteConfigFile,
      logLevel: 'error',
      build: { outDir: webDist, emptyOutDir: true },
    });
    for (const fixture of PAST_RUNS) await writePastRun(runsDir, fixture);
    app = await createApp({
      webDist,
      runs: { runsDir, env: { ANTHROPIC_API_KEY: 'placeholder-not-a-real-key' } },
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    url = `http://127.0.0.1:${address.port}/`;
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await app?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it('renders Setup with the prefilled Site URL, Suite and settings, and the Past Runs', async () => {
    await page.goto(url);
    await page.getByRole('heading', { name: 'Setup' }).waitFor({ timeout: 60_000 });

    expect(await page.getByLabel('Site URL').inputValue()).toBe('http://localhost:4000');

    const editorLines = page.locator('.monaco-editor .view-lines');
    await expect
      .poll(() => editorLines.textContent(), { timeout: 60_000 })
      .toContain('cheapest-red-shirt-price');
    await expect.poll(() => page.getByText('Valid Suite, 4 Scenarios').count()).toBe(1);

    const boxes = page.locator('.scenario-list input[type=checkbox]');
    expect(await boxes.count()).toBe(4);
    const checked = [];
    for (let i = 0; i < 4; i++) checked.push(await boxes.nth(i).isChecked());
    expect(checked).toEqual([true, false, false, false]);

    expect(await page.getByLabel('Model').inputValue()).toBe('claude-haiku-5-5');
    expect(await page.getByLabel('API key').getAttribute('placeholder')).toBe('Loaded from .env');
    expect(await page.getByLabel('Repeat').inputValue()).toBe('1');
    expect(await page.getByLabel('Max Steps').inputValue()).toBe('50');
    expect(await page.getByLabel('Max minutes').inputValue()).toBe('5');
    expect(await page.getByLabel('Max cost').inputValue()).toBe('2.00');

    const run = page.getByRole('button', { name: 'Run 1 Scenario' });
    expect(await run.isEnabled()).toBe(true);
    await page.getByRole('button', { name: 'Select all' }).click();
    await page.getByRole('button', { name: 'Run 4 Scenarios' }).waitFor();
    await page.getByRole('button', { name: 'Select none' }).click();
    await page.locator('.scenario-list input[type=checkbox]').nth(0).check();
    await page.locator('.scenario-list input[type=checkbox]').nth(1).check();
    await page.getByRole('button', { name: 'Run 2 Scenarios' }).waitFor();

    const items = page.locator('.run-item');
    expect(await items.count()).toBe(3);
    expect(await items.first().textContent()).toContain('Haiku 5.5');
    expect(await items.nth(1).textContent()).toContain('shop.example.com/de');

    const screenshot = process.env.UI_SCREENSHOT;
    if (screenshot) {
      await page.evaluate('document.fonts.ready');
      await page.mouse.move(0, 999);
      await page.screenshot({ path: screenshot, fullPage: true });
    }
  }, 120_000);

  it('validates the Suite live, marks the line in the editor and disables Run', async () => {
    await page.locator('.monaco-editor .view-line').first().click();
    await page.locator('.monaco-editor.focused').waitFor();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
    await page.keyboard.type('owner: me\n');
    // Monaco renders spaces as no-break spaces.
    const editorText = async () =>
      (await page.locator('.monaco-editor .view-lines').textContent())?.replaceAll('\u00a0', ' ');
    await expect.poll(editorText).toContain('owner: me');

    await page.getByText('1 error in the Suite').waitFor();
    expect(await page.locator('.error-line').first().textContent()).toContain('Line 1');
    await expect
      .poll(() => page.locator('.monaco-editor .squiggly-error').count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(await page.getByRole('button', { name: 'Run 2 Scenarios' }).isDisabled()).toBe(true);
    expect(await page.getByText('Fix the Suite errors to run.').count()).toBe(1);

    // Delete the added line again.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Backspace');
    await page.getByText('Valid Suite, 4 Scenarios').waitFor();
    expect(await page.getByRole('button', { name: 'Run 2 Scenarios' }).isEnabled()).toBe(true);
  }, 60_000);

  it('opens a Past Run into Setup and Results', async () => {
    await page.getByRole('button', { name: 'Open Run 2026-10-15_11-02-41' }).click();
    await page.getByRole('heading', { name: 'Results' }).waitFor();
    expect(await page.getByLabel('Site URL').inputValue()).toBe('https://shop.example.com/de');
    expect(await page.getByLabel('Provider').inputValue()).toBe('openai');
    expect(await page.getByLabel('Model').inputValue()).toBe('gpt-6-luna');
    expect(await page.getByLabel('API key').inputValue()).toBe('');
    expect(await page.locator('#results').textContent()).toContain('Baseline passed 1/2');
  }, 60_000);
});
