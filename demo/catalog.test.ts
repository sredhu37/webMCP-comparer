import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { findProduct, products, searchProducts } from './shop/catalog.ts';
import { productIllustration } from './shop/illustration.ts';
import { matchRoute } from './shop/routes.ts';

const ids = (list: { id: string }[]) => list.map((product) => product.id);

describe('catalog', () => {
  it('has about 20 products with unique ids, sizes and alt text', () => {
    expect(products.length).toBeGreaterThanOrEqual(18);
    expect(new Set(ids([...products])).size).toBe(products.length);
    for (const product of products) {
      expect(product.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(product.sizes.length).toBeGreaterThan(0);
      expect(product.alt.length).toBeGreaterThan(5);
      expect(productIllustration(product)).toContain('<svg');
    }
  });

  it('has every product the sample Suite relies on', async () => {
    const suite = await readFile(new URL('./sample-suite.yaml', import.meta.url), 'utf8');
    for (const [, id] of suite.matchAll(/productId === '([\w-]+)'/g)) {
      expect(findProduct(id ?? '')).toBeDefined();
    }
    expect(findProduct('blue-sneakers')?.sizes).toContain('42');
    expect(findProduct('red-shirt-basic')?.sizes).toContain('M');
  });

  it('finds red shirts cheapest first, starting at 19.99', () => {
    const results = searchProducts({ query: 'red shirt' });

    expect(results[0]).toMatchObject({ id: 'red-shirt-basic', price: 19.99 });
    expect(results.every((product) => product.color === 'red')).toBe(true);
    expect(results.every((product) => product.category === 'shirts')).toBe(true);
    expect(results.map((product) => product.price)).toEqual(
      results.map((product) => product.price).sort((a, b) => a - b),
    );
  });

  it('combines filters', () => {
    expect(ids(searchProducts({ category: 'shoes', size: '42', maxPrice: 80 }))).toEqual([
      'white-sneakers',
      'blue-sneakers',
    ]);
    expect(ids(searchProducts({ color: 'BLACK', category: 'hats' }))).toEqual(['black-hat']);
    expect(searchProducts({ query: 'nothing like this' })).toEqual([]);
  });

  it('ignores an unparseable max price', () => {
    expect(searchProducts({ maxPrice: Number.NaN })).toHaveLength(products.length);
  });
});

describe('routes', () => {
  it('matches every shop page', () => {
    expect(matchRoute('/')).toEqual({ page: 'home' });
    expect(matchRoute('/search')).toEqual({ page: 'search' });
    expect(matchRoute('/products/black-hat')).toEqual({ page: 'product', productId: 'black-hat' });
    expect(matchRoute('/cart')).toEqual({ page: 'cart' });
    expect(matchRoute('/checkout')).toEqual({ page: 'checkout' });
    expect(matchRoute('/order/12345')).toEqual({ page: 'order', orderId: '12345' });
  });

  it('rejects unknown pages and products', () => {
    expect(matchRoute('/products/no-such-thing')).toBeUndefined();
    expect(matchRoute('/order/abc')).toBeUndefined();
    expect(matchRoute('/admin')).toBeUndefined();
  });
});
