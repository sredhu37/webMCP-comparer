import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createDemoApp } from './app.ts';

describe('demo shop server', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it.each([
    '/',
    '/search?color=red',
    '/products/blue-sneakers',
    '/cart',
    '/checkout',
    '/order/12345',
  ])('serves the page shell for %s', async (url) => {
    app = createDemoApp();
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<script type="module" src="/assets/shop.ts"></script>');
  });

  it.each(['/nope', '/products/unknown-product', '/order/abc'])(
    'answers 404 for %s',
    async (url) => {
      app = createDemoApp();
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('text/html');
    },
  );

  it('serves browser modules as JavaScript without types', async () => {
    app = createDemoApp();
    const response = await app.inject({ method: 'GET', url: '/assets/cart.ts' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/javascript');
    expect(response.body).toContain('export function addToCart(productId, size, quantity = 1)');
    expect(response.body).not.toContain('interface CartItem');
  });

  it('serves the stylesheet', async () => {
    app = createDemoApp();
    const response = await app.inject({ method: 'GET', url: '/assets/styles.css' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/css');
  });

  it.each(['/assets/missing.ts', '/assets/tsconfig.json', '/assets/..%2Fapp.ts'])(
    'answers 404 for %s',
    async (url) => {
      app = createDemoApp();
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(404);
    },
  );

  it('serves a product illustration as SVG', async () => {
    app = createDemoApp();
    const response = await app.inject({ method: 'GET', url: '/images/red-shirt-basic.svg' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.body).toMatch(/^<svg [^>]*viewBox="0 0 200 200"/);
  });

  it.each(['/images/unknown.svg', '/images/red-shirt-basic.png'])(
    'answers 404 for %s',
    async (url) => {
      app = createDemoApp();
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(404);
    },
  );
});
