import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Scenario } from '../suite/parse.ts';
import { startDemoShop, type RunningDemoShop } from '../testing/demo-shop.ts';
import { checkStartPageTools, webMcpWarnings } from './webmcp-check.ts';

const testTimeout = 30_000;
const SHOP_TOOLS = ['add_to_cart', 'get_product', 'search_products', 'view_cart'];
const options = { settleMs: 300, pollMs: 50, startPageTimeoutMs: 5_000 };

let shop: RunningDemoShop;
let plain: Server;
let plainUrl: string;

beforeAll(async () => {
  shop = await startDemoShop();
  plain = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><title>No tools</title><p>Nothing to see.</p>');
  });
  await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
  plainUrl = `http://127.0.0.1:${(plain.address() as AddressInfo).port}`;
}, testTimeout);

afterAll(async () => {
  await shop?.close();
  await new Promise((resolve) => plain?.close(resolve));
});

const scenario = (id: string, path?: string): Scenario => ({
  id,
  prompt: 'Do it.',
  ...(path ? { path } : {}),
});

describe('checkStartPageTools', () => {
  it(
    'lists the WebMCP tools of each selected start page',
    async () => {
      const results = await checkStartPageTools(
        shop.baseUrl,
        [scenario('home'), scenario('product', '/products/blue-sneakers'), scenario('again')],
        options,
      );
      expect(results).toEqual([
        { scenario: 'home', startUrl: `${shop.baseUrl}/`, tools: SHOP_TOOLS, error: null },
        {
          scenario: 'product',
          startUrl: `${shop.baseUrl}/products/blue-sneakers`,
          tools: SHOP_TOOLS,
          error: null,
        },
        { scenario: 'again', startUrl: `${shop.baseUrl}/`, tools: SHOP_TOOLS, error: null },
      ]);
      expect(webMcpWarnings(results)).toEqual([]);
    },
    testTimeout,
  );

  it(
    'warns, without failing, when a start page has no WebMCP tools',
    async () => {
      const results = await checkStartPageTools(plainUrl, [scenario('plain')], options);
      expect(results).toEqual([
        { scenario: 'plain', startUrl: `${plainUrl}/`, tools: [], error: null },
      ]);
      expect(webMcpWarnings(results)).toEqual([
        `Scenario plain: the start page ${plainUrl}/ has no WebMCP tools, so the WebMCP lane only has Browser tools.`,
      ]);
    },
    testTimeout,
  );

  it(
    'warns when a start page cannot be opened',
    async () => {
      const closed = createServer();
      await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
      await new Promise((resolve) => closed.close(resolve));

      const results = await checkStartPageTools(url, [scenario('down')], options);
      expect(results[0]).toMatchObject({ scenario: 'down', tools: [] });
      expect(results[0]?.error).toContain('ERR_CONNECTION_REFUSED');
      expect(webMcpWarnings(results)[0]).toMatch(
        /^Scenario down: could not list WebMCP tools on http:\/\/127\.0\.0\.1:\d+\/: /,
      );
    },
    testTimeout,
  );
});
