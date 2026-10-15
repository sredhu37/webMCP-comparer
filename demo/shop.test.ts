import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDemoApp } from './app.ts';

const actionTimeout = 5_000;
const testTimeout = 20_000;
const launchTimeout = 15_000;

interface ToolText {
  content: { type: string; text: string }[];
  isError?: boolean;
}

function toolJson(result: unknown): unknown {
  const { content } = result as ToolText;
  return JSON.parse(content[0]?.text ?? 'null');
}

let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  app = createDemoApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}, launchTimeout);

afterAll(async () => {
  await app.close();
});

async function launch(webmcp: boolean): Promise<Browser> {
  return chromium.launch({
    headless: true,
    timeout: launchTimeout,
    args: webmcp ? ['--enable-features=WebMCP'] : [],
  });
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.setDefaultTimeout(actionTimeout);
  context.setDefaultNavigationTimeout(actionTimeout);
  return context.newPage();
}

/** Full markup of a page whose cart holds one red shirt, for comparing the two browser setups. */
async function checkoutMarkup(browser: Browser): Promise<string> {
  const page = await newPage(browser);
  await page.goto(`${baseUrl}/products/red-shirt-basic`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto(`${baseUrl}/checkout`);
  const markup = await page.content();
  await page.context().close();
  return markup;
}

describe('demo shop with WebMCP off', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launch(false);
  }, launchTimeout);

  afterAll(async () => {
    await browser?.close();
  });

  it(
    'has no document.modelContext and no WebMCP tools',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/`);

      expect(await page.evaluate("'modelContext' in document")).toBe(false);
      await expect(page.webmcp.tools()).rejects.toThrow(/WebMCP is not enabled/);
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'shows product illustrations with alt text',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/search`);
      await page.waitForFunction(
        '[...document.images].every((image) => image.complete && image.naturalWidth > 0)',
      );
      const images = await page.locator('main img').all();

      expect(images.length).toBeGreaterThanOrEqual(18);
      for (const image of images) {
        expect(await image.getAttribute('alt')).toMatch(/\w+/);
        expect(await image.getAttribute('src')).toMatch(/^\/images\/[\w-]+\.svg$/);
      }
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'completes a full click-through checkout',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/`);

      await page.getByRole('searchbox', { name: 'Search' }).fill('shirt');
      await page.getByRole('combobox', { name: 'Colour' }).selectOption('red');
      await page.getByRole('button', { name: 'Search' }).click();
      await page.waitForURL(/\/search\?/);
      await expect(page.locator('.card .name').first().textContent()).resolves.toBe(
        'Red shirt basic',
      );

      await page.getByRole('link', { name: 'Red shirt basic' }).last().click();
      await page.waitForURL(/\/products\/red-shirt-basic$/);
      await page.getByLabel('Size').selectOption('M');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await expect(page.getByRole('status').textContent()).resolves.toBe(
        'Added Red shirt basic (M) to cart.',
      );
      await expect(page.locator('#cart-link').textContent()).resolves.toBe('Cart (1)');

      await page.getByRole('link', { name: 'Cart (1)' }).click();
      await page.waitForURL(/\/cart$/);
      await expect(page.locator('.total').textContent()).resolves.toBe('Total: €19.99');

      await page.getByRole('link', { name: 'Checkout' }).click();
      await page.waitForURL(/\/checkout$/);
      await page.getByLabel('Full name').fill('Jane Doe');
      await page.getByLabel('Email').fill('jane@example.com');
      await page.getByLabel('Address').fill('Hauptstr. 1, Düsseldorf');
      await page.getByRole('button', { name: 'Place order' }).click();
      await page.waitForURL(/\/order\/\d+$/);

      const orderId = page.url().split('/').pop();
      await expect(page.locator('h1').textContent()).resolves.toBe(`Order placed #${orderId}`);
      expect(await page.evaluate('shop.cart()')).toEqual([]);
      expect(await page.evaluate('shop.lastOrder()')).toMatchObject({
        id: orderId,
        name: 'Jane Doe',
        email: 'jane@example.com',
        total: 19.99,
        items: [{ productId: 'red-shirt-basic', size: 'M', quantity: 1 }],
      });
      await expect(page.locator('#cart-link').textContent()).resolves.toBe('Cart (0)');
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'shows the debug panel only with ?debug',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/`);
      await expect(page.locator('#debug').isHidden()).resolves.toBe(true);

      await page.goto(`${baseUrl}/?debug`);
      await expect(page.locator('#debug').textContent()).resolves.toContain('WebMCP: off');
      await page.context().close();
    },
    testTimeout,
  );
});

describe('demo shop with WebMCP on', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await launch(true);
  }, launchTimeout);

  afterAll(async () => {
    await browser?.close();
  });

  it(
    'lists the imperative tools on every page and checkout on /checkout',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/`);
      const names = (await page.webmcp.tools()).map((tool) => tool.name).sort();
      expect(names).toEqual(['add_to_cart', 'get_product', 'search_products', 'view_cart']);

      await page.webmcp.callTool(
        'add_to_cart',
        { productId: 'black-hat', size: 'one size' },
        { timeout: actionTimeout },
      );
      await page.goto(`${baseUrl}/checkout`);
      const checkoutNames = (await page.webmcp.tools()).map((tool) => tool.name);
      expect(checkoutNames).toContain('checkout');
      expect(checkoutNames).toContain('search_products');
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'searches products cheapest first',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/`);
      const result: unknown = await page.webmcp.callTool(
        'search_products',
        { query: 'shirt', color: 'red' },
        { timeout: actionTimeout },
      );

      const found = toolJson(result) as { id: string; price: number }[];
      expect(found[0]).toMatchObject({ id: 'red-shirt-basic', price: 19.99 });
      expect(found.map((product) => product.id)).toEqual([
        'red-shirt-basic',
        'red-polo',
        'red-linen-shirt',
        'red-shirt-premium',
      ]);
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'gets one product',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/`);
      const result: unknown = await page.webmcp.callTool(
        'get_product',
        { id: 'blue-sneakers' },
        { timeout: actionTimeout },
      );

      expect(toolJson(result)).toMatchObject({
        id: 'blue-sneakers',
        sizes: ['40', '41', '42', '43', '44'],
      });
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'adds to the cart without leaving the page and rejects a bad size',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/products/blue-sneakers`);

      const bad = (await page.webmcp.callTool(
        'add_to_cart',
        { productId: 'red-polo', size: 'M' },
        { timeout: actionTimeout },
      )) as ToolText;
      expect(bad.isError).toBe(true);
      expect(bad.content[0]?.text).toBe(
        'Size "M" is not available for Red polo. Available sizes: L, XL.',
      );

      await page.webmcp.callTool(
        'add_to_cart',
        { productId: 'red-shirt-basic', size: 'M' },
        { timeout: actionTimeout },
      );
      expect(page.url()).toBe(`${baseUrl}/products/blue-sneakers`);
      await expect(page.locator('#cart-link').textContent()).resolves.toBe('Cart (1)');

      const cart: unknown = await page.webmcp.callTool('view_cart', {}, { timeout: actionTimeout });
      expect(toolJson(cart)).toMatchObject({
        items: [{ productId: 'red-shirt-basic', size: 'M', quantity: 1, name: 'Red shirt basic' }],
        total: 19.99,
      });
      expect(
        await page.evaluate(
          "shop.cart().some(i => i.productId === 'red-shirt-basic' && i.size === 'M')",
        ),
      ).toBe(true);
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'checks out through the declarative checkout tool and returns an order id',
    async () => {
      const page = await newPage(browser);
      await page.goto(`${baseUrl}/`);
      await page.webmcp.callTool(
        'add_to_cart',
        { productId: 'black-hat', size: 'one size' },
        { timeout: actionTimeout },
      );
      await page.goto(`${baseUrl}/checkout?debug`);
      await expect(page.locator('#debug').textContent()).resolves.toContain('WebMCP: on');

      const result: unknown = await page.webmcp.callTool(
        'checkout',
        { name: 'Jane Doe', email: 'jane@example.com', address: 'Hauptstr. 1, Düsseldorf' },
        { timeout: actionTimeout },
      );

      expect(result).toMatchObject({
        orderId: expect.stringMatching(/^\d+$/) as string,
        total: 24.99,
      });
      const { orderId } = result as { orderId: string };
      await page.waitForURL(`${baseUrl}/order/${orderId}`);
      await expect(page.locator('h1').textContent()).resolves.toBe(`Order placed #${orderId}`);
      expect(
        await page.evaluate("shop.lastOrder()?.items.some(i => i.productId === 'black-hat')"),
      ).toBe(true);
      await page.context().close();
    },
    testTimeout,
  );

  it(
    'renders pages identical to the browser without WebMCP',
    async () => {
      const plain = await launch(false);
      try {
        const [withWebmcp, withoutWebmcp] = await Promise.all([
          checkoutMarkup(browser),
          checkoutMarkup(plain),
        ]);
        expect(withWebmcp).toBe(withoutWebmcp);
      } finally {
        await plain.close();
      }
    },
    testTimeout,
  );
});
