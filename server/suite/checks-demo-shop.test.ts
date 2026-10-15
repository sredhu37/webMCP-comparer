import { readFile } from 'node:fs/promises';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { launchLaneChromium, openLanePage } from '../lane/browser.ts';
import { startDemoShop, type RunningDemoShop } from '../testing/demo-shop.ts';
import { decideFinish, runChecks, type Check } from './checks.ts';
import { parseSuite, type Scenario } from './parse.ts';
import { resolveStartUrl } from './start-url.ts';

const setupTimeout = 30_000;
const testTimeout = 20_000;
const checkTimeoutMs = 2_000;

let shop: RunningDemoShop;
let browser: Browser;
let scenarios: Map<string, Scenario>;

beforeAll(async () => {
  const source = await readFile(new URL('../../demo/sample-suite.yaml', import.meta.url), 'utf8');
  const parsed = parseSuite(source);
  if (!parsed.ok) throw new Error(parsed.errors.map((error) => error.message).join('\n'));
  scenarios = new Map(parsed.suite.scenarios.map((scenario) => [scenario.id, scenario]));
  [shop, browser] = await Promise.all([startDemoShop(), launchLaneChromium('webmcp')]);
}, setupTimeout);

afterAll(async () => {
  await browser?.close();
  await shop?.close();
});

let page: Page;

beforeEach(async () => {
  page = await openLanePage(browser, { actionTimeoutMs: 2_000, navigationTimeoutMs: 5_000 });
});

afterEach(async () => {
  await page?.context().close();
});

function scenario(id: string): Scenario {
  const found = scenarios.get(id);
  if (!found) throw new Error(`no Scenario ${id} in the sample Suite`);
  return found;
}

async function start(id: string): Promise<Scenario> {
  const found = scenario(id);
  await page.goto(resolveStartUrl(shop.baseUrl, found));
  return found;
}

async function checksPass(found: Scenario, answer = ''): Promise<boolean> {
  return (await runChecks(page, found.success ?? [], answer, { timeoutMs: checkTimeoutMs })).pass;
}

async function addToCartOnProductPage(productId: string, size: string): Promise<void> {
  await page.goto(`${shop.baseUrl}/products/${productId}`);
  await page.getByLabel('Size').selectOption(size);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('status').filter({ hasText: 'Added' }).waitFor();
}

describe('sample Suite checks on the demo shop', () => {
  it(
    'cheapest-red-shirt-price: answerContains decides on the answer',
    async () => {
      const found = await start('cheapest-red-shirt-price');
      expect(await checksPass(found, 'The cheapest red shirt costs €19.99.')).toBe(true);
      const decision = await runChecks(page, found.success!, 'It costs €24.99.');
      expect(decision).toMatchObject({
        pass: false,
        reason: 'check failed: answerContains: 19.99',
      });
    },
    testTimeout,
  );

  it(
    'add-red-shirt-to-cart: the cart script check fails before and passes after',
    async () => {
      const found = await start('add-red-shirt-to-cart');
      expect(await checksPass(found)).toBe(false);

      await addToCartOnProductPage('red-shirt-basic', 'L');
      expect(await checksPass(found)).toBe(false);
      await addToCartOnProductPage('red-shirt-basic', 'M');
      expect(await checksPass(found)).toBe(true);
    },
    testTimeout,
  );

  it(
    'add-red-shirt-to-cart: passes on the WebMCP route, which stays on the home page',
    async () => {
      const found = await start('add-red-shirt-to-cart');
      await page.webmcp.callTool(
        'add_to_cart',
        { productId: 'red-shirt-basic', size: 'M' },
        { timeout: checkTimeoutMs },
      );
      expect(page.url()).toBe(`${shop.baseUrl}/`);
      expect(await checksPass(found)).toBe(true);
    },
    testTimeout,
  );

  it(
    'add-from-product-page: starts on its path and checks the cart',
    async () => {
      const found = await start('add-from-product-page');
      expect(page.url()).toBe(`${shop.baseUrl}/products/blue-sneakers`);
      expect(await checksPass(found)).toBe(false);

      await page.getByLabel('Size').selectOption('42');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await page.getByRole('status').filter({ hasText: 'Added' }).waitFor();
      expect(await checksPass(found)).toBe(true);
    },
    testTimeout,
  );

  it(
    'full-checkout: the lastOrder script check passes after a real checkout',
    async () => {
      const found = await start('full-checkout');
      const before = await runChecks(page, found.success!, '', { timeoutMs: checkTimeoutMs });
      expect(before).toMatchObject({
        pass: false,
        reason: `check failed: script: ${(found.success![0] as { script: string }).script}`,
        checks: [{ pass: false, detail: 'returned undefined' }],
      });

      await addToCartOnProductPage('black-hat', 'one size');
      await page.goto(`${shop.baseUrl}/checkout`);
      await page.getByLabel('Full name').fill('Jane Doe');
      await page.getByLabel('Email').fill('jane@example.com');
      await page.getByLabel('Address').fill('Hauptstr. 1, Düsseldorf');
      await page.getByRole('button', { name: 'Place order' }).click();
      await page.waitForURL(/\/order\/\d+$/);
      expect(await checksPass(found)).toBe(true);
    },
    testTimeout,
  );
});

describe('page checks on the demo shop', () => {
  it(
    'urlContains, textVisible and elementExists read the final page',
    async () => {
      await addToCartOnProductPage('red-shirt-basic', 'M');
      await page.goto(`${shop.baseUrl}/cart`);

      const passing: Check[] = [
        { urlContains: '/cart' },
        { textVisible: 'your CART' },
        { textVisible: 'Total: €19.99' },
        { elementExists: 'table tbody tr' },
        { elementExists: 'a[href="/checkout"]' },
      ];
      expect(await runChecks(page, passing, '', { timeoutMs: checkTimeoutMs })).toMatchObject({
        pass: true,
      });

      const failing: [Check, string][] = [
        [{ urlContains: '/checkout' }, `final URL: ${shop.baseUrl}/cart`],
        [{ urlContains: '/CART' }, `final URL: ${shop.baseUrl}/cart`],
        [{ textVisible: 'Your cart is empty' }, 'text not visible'],
        [{ textVisible: 'WebMCP: on' }, 'text not visible'],
        [{ elementExists: '.order-confirmation' }, 'no matching element'],
      ];
      for (const [check, detail] of failing) {
        const decision = await runChecks(page, [check], '', { timeoutMs: checkTimeoutMs });
        expect(decision.pass).toBe(false);
        expect(decision.checks[0]?.detail).toBe(detail);
      }
    },
    testTimeout,
  );

  it(
    'decideFinish uses the checks when given, otherwise the agent report',
    async () => {
      await page.goto(`${shop.baseUrl}/search?color=red`);
      const finish = { success: false, answer: 'Red shirt basic, €19.99' };

      await expect(
        decideFinish(page, finish, [{ urlContains: 'color=red' }, { answerContains: '19.99' }], {
          timeoutMs: checkTimeoutMs,
        }),
      ).resolves.toMatchObject({ pass: true });
      await expect(decideFinish(page, finish, undefined)).resolves.toMatchObject({
        pass: false,
        reason: 'agent reported failure',
      });
    },
    testTimeout,
  );
});
