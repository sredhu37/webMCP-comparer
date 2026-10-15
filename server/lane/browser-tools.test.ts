import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { startDemoShop, type RunningDemoShop } from '../testing/demo-shop.ts';
import { launchLaneChromium, openLanePage, VIEWPORT } from './browser.ts';
import {
  BROWSER_TOOL_NAMES,
  createBrowserTools,
  type BrowserToolName,
  type BrowserToolTimeouts,
} from './browser-tools.ts';
import { ScreenshotFiles } from './screenshots.ts';
import { READ_PAGE_LIMIT, TRUNCATED } from './snapshot.ts';
import type { LaneTool, ToolResult } from './tool.ts';

const setupTimeout = 30_000;
const testTimeout = 20_000;
const timeouts: Partial<BrowserToolTimeouts> = {
  actionMs: 2_000,
  navigationMs: 5_000,
  waitForTextMs: 500,
  pauseMs: 50,
};

let shop: RunningDemoShop;
let browser: Browser;
let screenshotDir: string;

beforeAll(async () => {
  [shop, browser, screenshotDir] = await Promise.all([
    startDemoShop(),
    launchLaneChromium('baseline'),
    mkdtemp(join(tmpdir(), 'browser-tools-')),
  ]);
}, setupTimeout);

afterAll(async () => {
  await browser?.close();
  await shop?.close();
  if (screenshotDir) await rm(screenshotDir, { recursive: true, force: true });
});

let page: Page;
let screenshots: ScreenshotFiles;
let tool: Record<BrowserToolName, LaneTool>;

function toolsFor(scenarioId: string, attempt: number): Record<BrowserToolName, LaneTool> {
  const list = createBrowserTools({ page, screenshots, scenarioId, attempt, timeouts });
  return Object.fromEntries(list.map((t) => [t.name, t])) as Record<BrowserToolName, LaneTool>;
}

beforeEach(async () => {
  page = await openLanePage(browser, { actionTimeoutMs: 2_000, navigationTimeoutMs: 5_000 });
  screenshots = new ScreenshotFiles(join(screenshotDir, crypto.randomUUID()));
  tool = toolsFor('find-red-shirt', 1);
});

afterEach(async () => {
  await page?.context().close();
});

function text(result: ToolResult): string {
  return result.content.map((part) => (part.type === 'text' ? part.text : '[image]')).join('\n');
}

async function open(path: string): Promise<void> {
  await page.goto(`${shop.baseUrl}${path}`);
}

async function refOf(pattern: string): Promise<string> {
  const snapshot = text(await tool.read_page.execute({}));
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}[^\\n]*\\[ref=(\\w+)\\]`).exec(snapshot);
  if (!match) throw new Error(`no ref for ${pattern} in:\n${snapshot}`);
  return match[1]!;
}

async function center(selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** Width and height from the first JPEG start-of-frame marker. */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < jpeg.length) {
    const marker = jpeg[offset + 1]!;
    const length = jpeg.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc2) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('no JPEG frame header');
}

describe('Browser tools', () => {
  it('are the tools of the spec, each with an object input schema', () => {
    expect(Object.keys(tool)).toEqual([...BROWSER_TOOL_NAMES]);
    for (const t of Object.values(tool)) {
      expect(t.source).toBe('browser');
      expect(t.description).not.toBe('');
      expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });

  it(
    'reject input that does not match the schema without touching the page',
    async () => {
      await open('/');
      const missing = await tool.click.execute({});
      expect(missing.isError).toBe(true);
      expect(text(missing)).toBe('Invalid input for click: missing required property "target".');

      const badEnum = await tool.scroll.execute({ direction: 'left' });
      expect(text(badEnum)).toBe(
        'Invalid input for scroll: direction must be one of "up", "down".',
      );

      const extra = await tool.navigate.execute({ url: '/cart', newTab: true });
      expect(text(extra)).toBe('Invalid input for navigate: unknown property "newTab".');
      expect(page.url()).toBe(`${shop.baseUrl}/`);
    },
    testTimeout,
  );
});

describe('screenshot', () => {
  it(
    'saves the viewport as JPEG with the per-Lane counter name and returns the image',
    async () => {
      await open('/');
      const first = await tool.screenshot.execute({});

      expect(first.isError).toBe(false);
      expect(first.meta.screenshot).toMatchObject({
        fileName: '001-find-red-shirt-attempt-1.jpg',
        ...VIEWPORT,
      });
      const file = await readFile(first.meta.screenshot!.path);
      expect(file.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(jpegSize(file)).toEqual(VIEWPORT);
      expect(first.content).toEqual([
        { type: 'image', data: file.toString('base64'), mediaType: 'image/jpeg' },
      ]);

      await tool.read_page.execute({});
      const second = await toolsFor('add-red-shirt', 2).screenshot.execute({});
      expect(second.meta.screenshot?.fileName).toBe('002-add-red-shirt-attempt-2.jpg');
      expect(screenshots.count).toBe(2);
    },
    testTimeout,
  );
});

describe('read_page', () => {
  it(
    'returns the accessibility snapshot with refs, title and URL',
    async () => {
      await open('/products/blue-sneakers');
      const result = await tool.read_page.execute({});
      const snapshot = text(result);

      expect(result.isError).toBe(false);
      expect(result.meta).toEqual({});
      expect(snapshot).toMatch(/^Page: Blue sneakers \| Demo Shop\nURL: http:\/\/127\.0\.0\.1:\d+/);
      expect(snapshot).toContain('heading "Blue sneakers" [level=1]');
      expect(snapshot).toMatch(/button "Add to cart" \[ref=\w+\]/);
      expect(snapshot).toMatch(/combobox "Size" \[ref=\w+\]/);
    },
    testTimeout,
  );

  it(
    `cuts the snapshot at ${READ_PAGE_LIMIT} characters`,
    async () => {
      await open('/');
      await page.evaluate(`(() => {
        const main = document.querySelector('main');
        for (let i = 0; i < 3000; i++) {
          const p = document.createElement('p');
          p.textContent = 'Filler paragraph number ' + i;
          main.append(p);
        }
      })()`);
      const snapshot = text(await tool.read_page.execute({}));

      expect(snapshot).toHaveLength(READ_PAGE_LIMIT + `\n${TRUNCATED}`.length);
      expect(snapshot.endsWith(`\n${TRUNCATED}`)).toBe(true);
    },
    testTimeout,
  );
});

describe('click', () => {
  it(
    'clicks by ref and reports the method',
    async () => {
      await open('/products/blue-sneakers');
      const result = await tool.click.execute({
        target: { ref: await refOf('button "Add to cart"') },
      });

      expect(result.isError).toBe(false);
      expect(result.meta).toEqual({ target: 'ref' });
      await expect(page.getByRole('status').textContent()).resolves.toBe(
        'Added Blue sneakers (40) to cart.',
      );
    },
    testTimeout,
  );

  it(
    'clicks by CSS selector and follows the navigation',
    async () => {
      await open('/');
      const result = await tool.click.execute({ target: { selector: '#cart-link' } });

      expect(result.meta).toEqual({ target: 'selector' });
      expect(text(result)).toBe(
        `Clicked selector #cart-link.\nPage: Cart | Demo Shop (${shop.baseUrl}/cart)`,
      );
    },
    testTimeout,
  );

  it(
    'clicks by viewport coordinates',
    async () => {
      await open('/');
      const result = await tool.click.execute({ target: await center('#cart-link') });

      expect(result.isError).toBe(false);
      expect(result.meta).toEqual({ target: 'coordinates' });
      expect(page.url()).toBe(`${shop.baseUrl}/cart`);
    },
    testTimeout,
  );

  it(
    'uses the first element when a selector matches several',
    async () => {
      await open('/search?color=red');
      const names = page.locator('.card a.name');
      const count = await names.count();
      const firstHref = await names.first().getAttribute('href');
      expect(count).toBeGreaterThan(1);

      const result = await tool.click.execute({ target: { selector: '.card a.name' } });
      expect(text(result)).toContain(`(first of ${count} matches)`);
      expect(page.url()).toBe(`${shop.baseUrl}${firstHref}`);
    },
    testTimeout,
  );

  it(
    'returns an error for a bad target and keeps the method',
    async () => {
      await open('/');
      const staleRef = await refOf('link "Cart (0)"');
      await open('/cart');

      const cases: [unknown, string, string | undefined][] = [
        [
          { ref: staleRef },
          `ref "${staleRef}" is not on the page; refs come from the latest read_page, call it again`,
          'ref',
        ],
        [{ ref: 'e9999' }, 'ref "e9999" is not on the page', 'ref'],
        [{ selector: '#nope' }, 'no element matches selector "#nope"', 'selector'],
        [{ selector: '###' }, 'invalid selector "###"', 'selector'],
        [{ x: 1280, y: 10 }, 'point (1280, 10) is outside the 1280 x 800 viewport', 'coordinates'],
        [{ x: 10 }, 'target needs both x and y', undefined],
        [{ ref: 'e1', selector: 'a' }, 'target needs exactly one of', undefined],
        [{}, 'target needs exactly one of', undefined],
      ];
      for (const [target, message, method] of cases) {
        const result = await tool.click.execute({ target });
        expect(result.isError).toBe(true);
        expect(text(result)).toContain(message);
        expect(result.meta.target).toBe(method);
      }
      expect(page.url()).toBe(`${shop.baseUrl}/cart`);
    },
    testTimeout,
  );
});

describe('type', () => {
  it(
    'types by ref and submits with Enter',
    async () => {
      await open('/');
      const result = await tool.type.execute({
        target: { ref: await refOf('searchbox "Search"') },
        text: 'sneakers',
        submit: true,
      });

      expect(result.meta).toEqual({ target: 'ref' });
      expect(text(result)).toMatch(/^Typed "sneakers" into ref \w+ and pressed Enter\./);
      expect(page.url()).toBe(`${shop.baseUrl}/search?query=sneakers&category=&color=&maxPrice=`);
    },
    testTimeout,
  );

  it(
    'replaces the value by selector and by coordinates',
    async () => {
      await page.evaluate(`localStorage.clear()`).catch(() => undefined);
      await open('/products/black-hat');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await open('/checkout');

      const bySelector = await tool.type.execute({
        target: { selector: '#name' },
        text: 'Jane Doe',
      });
      expect(bySelector.meta).toEqual({ target: 'selector' });
      await page.locator('#email').fill('old@example.com');
      const byPoint = await tool.type.execute({
        target: await center('#email'),
        text: 'jane@example.com',
      });
      expect(byPoint.meta).toEqual({ target: 'coordinates' });

      await expect(page.locator('#name').inputValue()).resolves.toBe('Jane Doe');
      await expect(page.locator('#email').inputValue()).resolves.toBe('jane@example.com');
    },
    testTimeout,
  );
});

describe('select', () => {
  it(
    'chooses an option by ref, selector and coordinates, by value or label',
    async () => {
      await open('/products/blue-sneakers');
      const size = page.locator('#size');

      const byRef = await tool.select.execute({
        target: { ref: await refOf('combobox "Size"') },
        value: '42',
      });
      expect(byRef.meta).toEqual({ target: 'ref' });
      expect(text(byRef)).toMatch(/^Selected "42"\./);
      await expect(size.inputValue()).resolves.toBe('42');

      await tool.select.execute({ target: { selector: '#size' }, value: '43' });
      await expect(size.inputValue()).resolves.toBe('43');

      const byPoint = await tool.select.execute({ target: await center('#size'), value: '44' });
      expect(byPoint.meta).toEqual({ target: 'coordinates' });
      await expect(size.inputValue()).resolves.toBe('44');

      await open('/');
      await tool.select.execute({ target: { selector: '[aria-label="Colour"]' }, value: 'red' });
      await expect(page.locator('[aria-label="Colour"]').inputValue()).resolves.toBe('red');
      await tool.select.execute({
        target: { selector: '[aria-label="Colour"]' },
        value: 'Any colour',
      });
      await expect(page.locator('[aria-label="Colour"]').inputValue()).resolves.toBe('');
    },
    testTimeout,
  );

  it(
    'returns an error for a missing option or an element that is not a dropdown',
    async () => {
      await open('/products/blue-sneakers');
      const missing = await tool.select.execute({ target: { selector: '#size' }, value: '99' });
      expect(missing.isError).toBe(true);
      expect(text(missing)).toBe('no option "99"; options: "40", "41", "42", "43", "44"');

      const notSelect = await tool.select.execute({ target: await center('h1'), value: '42' });
      expect(notSelect.isError).toBe(true);
      expect(text(notSelect)).toBe('the element is not a dropdown (<select>)');
      expect(notSelect.meta).toEqual({ target: 'coordinates' });
    },
    testTimeout,
  );
});

describe('scroll', () => {
  it(
    'scrolls one screen down and up and says when it cannot',
    async () => {
      await open('/search');
      const max = await page.evaluate<number>(
        'document.documentElement.scrollHeight - innerHeight',
      );
      expect(max).toBeGreaterThan(0);
      const oneScreen = Math.min(VIEWPORT.height, max);

      expect(text(await tool.scroll.execute({ direction: 'up' }))).toBe(
        'Already at the top of the page.',
      );
      expect(text(await tool.scroll.execute({ direction: 'down' }))).toBe(
        `Scrolled down. Now at ${oneScreen} of ${max} px.`,
      );
      await expect(page.evaluate('scrollY')).resolves.toBe(oneScreen);
      if (oneScreen === max) {
        expect(text(await tool.scroll.execute({ direction: 'down' }))).toBe(
          'Already at the bottom of the page.',
        );
      }
      expect(text(await tool.scroll.execute({ direction: 'up' }))).toBe(
        `Scrolled up. Now at 0 of ${max} px.`,
      );
    },
    testTimeout,
  );
});

describe('navigate and back', () => {
  it(
    'opens absolute and relative URLs and goes back',
    async () => {
      await open('/');
      const relative = await tool.navigate.execute({ url: '/products/black-hat' });
      expect(text(relative)).toBe(
        `Navigated.\nPage: Black hat | Demo Shop (${shop.baseUrl}/products/black-hat)`,
      );

      await tool.navigate.execute({ url: `${shop.baseUrl}/cart` });
      expect(page.url()).toBe(`${shop.baseUrl}/cart`);

      const back = await tool.back.execute({});
      expect(back.isError).toBe(false);
      expect(page.url()).toBe(`${shop.baseUrl}/products/black-hat`);
    },
    testTimeout,
  );

  it(
    'reports an HTTP error status and refuses other schemes',
    async () => {
      await open('/');
      expect(text(await tool.navigate.execute({ url: '/no-such-page' }))).toMatch(
        /^Navigated \(HTTP 404\)\./,
      );

      const script = await tool.navigate.execute({ url: 'javascript:alert(1)' });
      expect(script.isError).toBe(true);
      expect(text(script)).toBe('Only http and https URLs can be opened.');
      const file = await tool.navigate.execute({ url: 'file:///etc/passwd' });
      expect(file.isError).toBe(true);
    },
    testTimeout,
  );

  it(
    'does not go back past the start page',
    async () => {
      await open('/');
      const result = await tool.back.execute({});

      expect(result.isError).toBe(true);
      expect(text(result)).toBe('There is no previous page.');
      expect(page.url()).toBe(`${shop.baseUrl}/`);
    },
    testTimeout,
  );
});

describe('wait', () => {
  it(
    'waits for text to appear, or reports that it did not',
    async () => {
      await open('/');
      await page.evaluate(`setTimeout(() => {
        document.querySelector('main').insertAdjacentHTML('beforeend', '<p>Late arrival</p>');
      }, 100)`);

      const appeared = await tool.wait.execute({ text: 'late arrival' });
      expect(appeared.isError).toBe(false);
      expect(text(appeared)).toBe('"late arrival" is visible.');

      const missing = await tool.wait.execute({ text: 'Never shown' });
      expect(missing.isError).toBe(true);
      expect(text(missing)).toBe('"Never shown" did not appear within 0.5 s.');
    },
    testTimeout,
  );

  it(
    'pauses briefly without text',
    async () => {
      await open('/');
      const started = Date.now();
      const result = await tool.wait.execute({});

      expect(text(result)).toBe('Waited 0.05 s.');
      expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    },
    testTimeout,
  );
});

describe('a closed page', () => {
  it(
    'throws instead of returning a tool error, so the Lane fails',
    async () => {
      await open('/');
      await page.close();
      await expect(tool.read_page.execute({})).rejects.toThrow();
    },
    testTimeout,
  );
});
