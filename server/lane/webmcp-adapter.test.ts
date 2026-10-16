import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startDemoShop, type RunningDemoShop } from '../testing/demo-shop.ts';
import { launchLaneChromium, openLanePage } from './browser.ts';
import { BROWSER_TOOL_NAMES, FINISH_TOOL_NAME } from './browser-tools.ts';
import type { LaneTool, ToolResult } from './tool.ts';
import {
  WEBMCP_CALL_TIMEOUT_MS,
  WebMcpTools,
  exposedNames,
  normalizeWebMcpResult,
} from './webmcp-adapter.ts';

const setupTimeout = 30_000;
const testTimeout = 20_000;

let shop: RunningDemoShop;
let browser: Browser;

beforeAll(async () => {
  [shop, browser] = await Promise.all([startDemoShop(), launchLaneChromium('webmcp')]);
}, setupTimeout);

afterAll(async () => {
  await browser?.close();
  await shop?.close();
});

let page: Page;
let webmcp: WebMcpTools;

beforeEach(async () => {
  page = await openLanePage(browser, { actionTimeoutMs: 2_000, navigationTimeoutMs: 5_000 });
  webmcp = new WebMcpTools(page, { callTimeoutMs: 1_000 });
});

afterEach(async () => {
  await page?.context().close();
});

async function open(path: string): Promise<void> {
  await page.goto(`${shop.baseUrl}${path}`);
}

function text(result: ToolResult): string {
  return result.content.map((part) => (part.type === 'text' ? part.text : '[image]')).join('\n');
}

function json(result: ToolResult): unknown {
  return JSON.parse(text(result));
}

async function toolNamed(name: string): Promise<LaneTool> {
  const { tools } = await webmcp.refresh();
  const found = tools.find((tool) => tool.name === name);
  if (!found) throw new Error(`no tool ${name} in ${tools.map((tool) => tool.name).join(', ')}`);
  return found;
}

/** Registers an extra tool on the demo page; `execute` is the body of an async function. */
async function register(name: string, execute: string, extra = ''): Promise<void> {
  await page.evaluate(`document.modelContext.registerTool({
    name: ${JSON.stringify(name)},
    description: 'Test tool ' + ${JSON.stringify(name)},
    ${extra}
    execute: async (input) => { ${execute} },
  })`);
}

async function cart(): Promise<unknown> {
  return page.evaluate('shop.cart()');
}

describe('tool list', () => {
  it(
    'exposes the site tools with their name, description and input schema',
    async () => {
      await open('/');
      const { tools, change } = await webmcp.refresh();

      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'add_to_cart',
        'get_product',
        'search_products',
        'view_cart',
      ]);
      expect(change?.added.sort()).toEqual(tools.map((tool) => tool.name).sort());
      const addToCart = tools.find((tool) => tool.name === 'add_to_cart')!;
      expect(addToCart).toMatchObject({
        source: 'webmcp',
        description: 'Add a product in a given size to the cart. Returns the updated cart.',
        inputSchema: { type: 'object', required: ['productId', 'size'] },
      });
    },
    testTimeout,
  );

  it(
    'reports no change when the list is the same and keeps the tool objects',
    async () => {
      await open('/');
      const first = await webmcp.refresh();
      const second = await webmcp.refresh();

      expect(second.change).toBeNull();
      expect(second.tools).toEqual(first.tools);
      second.tools.forEach((tool, index) => expect(tool).toBe(first.tools[index]));
    },
    testTimeout,
  );

  it(
    'follows navigation, late registration and changed descriptors',
    async () => {
      await open('/products/black-hat');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await webmcp.refresh();

      await open('/checkout');
      expect((await webmcp.refresh()).change).toEqual({
        added: ['checkout'],
        removed: [],
        changed: [],
      });

      await register('late_tool', "return 'late';");
      expect((await webmcp.refresh()).change).toEqual({
        added: ['late_tool'],
        removed: [],
        changed: [],
      });

      await open('/cart');
      await register(
        'late_tool',
        "return 'late';",
        "inputSchema: { type: 'object', properties: { n: { type: 'number' } } },",
      );
      expect((await webmcp.refresh()).change).toEqual({
        added: [],
        removed: ['checkout'],
        changed: ['late_tool'],
      });
    },
    testTimeout,
  );

  it(
    'reports an empty list on a page without tools',
    async () => {
      await page.goto('about:blank');
      expect(await webmcp.refresh()).toEqual({ tools: [], change: null });
    },
    testTimeout,
  );
});

describe('name clash', () => {
  it(
    'prefixes a site tool named like a Browser tool with site_',
    async () => {
      await open('/');
      await register('click', "return 'site click ran';");
      await register(FINISH_TOOL_NAME, "return 'site finish ran';");
      const { tools } = await webmcp.refresh();
      const names = tools.map((tool) => tool.name);

      expect(names).toContain('site_click');
      expect(names).toContain('site_finish');
      expect(names).not.toContain('click');
      const result = await (await toolNamed('site_click')).execute({});
      expect(text(result)).toBe('site click ran');
      expect(result.meta).toEqual({ webmcpName: 'click' });
    },
    testTimeout,
  );

  it('keeps prefixing while the prefixed name is taken', () => {
    const reserved = new Set<string>([...BROWSER_TOOL_NAMES, FINISH_TOOL_NAME]);
    expect(exposedNames(['click', 'site_click', 'search'], reserved)).toEqual([
      'site_site_click',
      'site_click',
      'search',
    ]);
  });
});

describe('calling a tool', () => {
  it(
    'passes MCP content through for the demo shop tools',
    async () => {
      await open('/products/blue-sneakers');

      const search = await (
        await toolNamed('search_products')
      ).execute({
        query: 'shirt',
        color: 'red',
      });
      expect(search.isError).toBe(false);
      expect(search.meta).toEqual({ webmcpName: 'search_products' });
      expect((json(search) as { id: string }[])[0]).toMatchObject({ id: 'red-shirt-basic' });

      const product = await (await toolNamed('get_product')).execute({ id: 'blue-sneakers' });
      expect(json(product)).toMatchObject({ sizes: ['40', '41', '42', '43', '44'] });

      const added = await (
        await toolNamed('add_to_cart')
      ).execute({
        productId: 'blue-sneakers',
        size: '42',
      });
      expect(json(added)).toMatchObject({ items: [{ productId: 'blue-sneakers', size: '42' }] });
      expect(page.url()).toBe(`${shop.baseUrl}/products/blue-sneakers`);

      const viewed = await (await toolNamed('view_cart')).execute({});
      expect(json(viewed)).toMatchObject({ total: 79.99 });
    },
    testTimeout,
  );

  it(
    'wraps the declarative checkout result as text and the page moves on',
    async () => {
      await open('/');
      await (await toolNamed('add_to_cart')).execute({ productId: 'black-hat', size: 'one size' });
      await open('/checkout');

      const result = await (
        await toolNamed('checkout')
      ).execute({
        name: 'Jane Doe',
        email: 'jane@example.com',
        address: 'Hauptstr. 1, Düsseldorf',
      });
      expect(result.isError).toBe(false);
      const { orderId } = json(result) as { orderId: string };
      expect(json(result)).toEqual({ orderId, total: 24.99 });

      await page.waitForURL(`${shop.baseUrl}/order/${orderId}`);
      const { tools, change } = await webmcp.refresh();
      expect(change?.removed).toEqual(['checkout']);
      expect(tools.map((tool) => tool.name)).not.toContain('checkout');
    },
    testTimeout,
  );

  it(
    'validates input against the input schema before calling',
    async () => {
      await open('/');
      const addToCart = await toolNamed('add_to_cart');

      const missing = await addToCart.execute({ productId: 'black-hat' });
      expect(missing).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Invalid input for add_to_cart: missing required property "size".',
          },
        ],
        meta: { webmcpName: 'add_to_cart', webmcpFailure: 'invalid_input' },
      });

      const zero = await addToCart.execute({
        productId: 'black-hat',
        size: 'one size',
        quantity: 0,
      });
      expect(text(zero)).toBe('Invalid input for add_to_cart: quantity must be >= 1.');

      const color = await (await toolNamed('search_products')).execute({ color: 'purple' });
      expect(text(color)).toMatch(/^Invalid input for search_products: color must be one of "/);

      const notObject = await addToCart.execute('black-hat');
      expect(text(notObject)).toBe('Invalid input for add_to_cart: input must be object.');
      expect(await cart()).toEqual([]);
    },
    testTimeout,
  );

  it(
    'returns an isError result as a tool error',
    async () => {
      await open('/');
      const result = await (
        await toolNamed('add_to_cart')
      ).execute({
        productId: 'red-polo',
        size: 'M',
      });

      expect(result.isError).toBe(true);
      expect(text(result)).toBe('Size "M" is not available for Red polo. Available sizes: L, XL.');
      expect(result.meta).toEqual({ webmcpName: 'add_to_cart', webmcpFailure: 'tool_error' });
    },
    testTimeout,
  );

  it(
    'returns a thrown error as a tool error',
    async () => {
      await open('/');
      await register('boom', "throw new Error('kaput');");
      const result = await (await toolNamed('boom')).execute({});

      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/^Tool boom failed: /);
      expect(result.meta).toEqual({ webmcpName: 'boom', webmcpFailure: 'thrown' });
    },
    testTimeout,
  );

  it(
    'returns a tool error when the tool is gone after navigation',
    async () => {
      await open('/');
      const viewCart = await toolNamed('view_cart');
      await page.goto('about:blank');
      const result = await viewCart.execute({});

      expect(result.isError).toBe(true);
      expect(result.meta.webmcpFailure).toBe('thrown');
    },
    testTimeout,
  );

  it(
    'times out a call that never returns',
    async () => {
      expect(WEBMCP_CALL_TIMEOUT_MS).toBe(15_000);
      const quick = new WebMcpTools(page, { callTimeoutMs: 300 });
      await open('/');
      await register('hang', 'await new Promise(() => {});');
      const hang = (await quick.refresh()).tools.find((tool) => tool.name === 'hang')!;

      const started = Date.now();
      const result = await hang.execute({});
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(result.isError).toBe(true);
      expect(text(result)).toBe('Tool hang did not respond within 0.3 s.');
      expect(result.meta).toEqual({ webmcpName: 'hang', webmcpFailure: 'timeout' });
    },
    testTimeout,
  );

  it(
    'wraps plain string, object and empty results as text and passes images through',
    async () => {
      await open('/');
      await register('plain_string', "return 'hello ' + input.who;");
      await register('plain_object', 'return { ok: true, items: [1, 2] };');
      await register('nothing', 'return undefined;');
      await register(
        'picture',
        "return { content: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }, { type: 'text', text: 'a dot' }] };",
      );

      const plain = await (await toolNamed('plain_string')).execute({ who: 'agent' });
      expect(plain.content).toEqual([{ type: 'text', text: 'hello agent' }]);
      const object = await (await toolNamed('plain_object')).execute({});
      expect(object.content).toEqual([{ type: 'text', text: '{"ok":true,"items":[1,2]}' }]);
      const nothing = await (await toolNamed('nothing')).execute({});
      expect(nothing.content).toEqual([{ type: 'text', text: '(no result)' }]);
      const picture = await (await toolNamed('picture')).execute({});
      expect(picture.content).toEqual([
        { type: 'image', data: 'iVBORw0KGgo=', mediaType: 'image/png' },
        { type: 'text', text: 'a dot' },
      ]);
    },
    testTimeout,
  );
});

describe('normalizeWebMcpResult', () => {
  it('keeps isError, turns unknown content parts into JSON text and fills an empty list', () => {
    expect(
      normalizeWebMcpResult({ content: [{ type: 'text', text: 'no' }], isError: true }),
    ).toEqual({ isError: true, content: [{ type: 'text', text: 'no' }] });
    expect(
      normalizeWebMcpResult({ content: [{ type: 'resource', resource: { uri: 'x:1' } }] }),
    ).toEqual({
      isError: false,
      content: [{ type: 'text', text: '{"type":"resource","resource":{"uri":"x:1"}}' }],
    });
    expect(normalizeWebMcpResult({ content: [] })).toEqual({
      isError: false,
      content: [{ type: 'text', text: '(empty result)' }],
    });
    expect(normalizeWebMcpResult(null).content).toEqual([{ type: 'text', text: '(no result)' }]);
    expect(normalizeWebMcpResult(42).content).toEqual([{ type: 'text', text: '42' }]);
    expect(normalizeWebMcpResult([1, 2]).content).toEqual([{ type: 'text', text: '[1,2]' }]);
  });
});
