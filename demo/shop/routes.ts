import { findProduct } from './catalog.ts';

export type Route =
  | { page: 'home' }
  | { page: 'search' }
  | { page: 'product'; productId: string }
  | { page: 'cart' }
  | { page: 'checkout' }
  | { page: 'order'; orderId: string };

/** The page for a URL path, or undefined when the shop has no such page. */
export function matchRoute(pathname: string): Route | undefined {
  if (pathname === '/') return { page: 'home' };
  if (pathname === '/search') return { page: 'search' };
  if (pathname === '/cart') return { page: 'cart' };
  if (pathname === '/checkout') return { page: 'checkout' };

  const product = /^\/products\/([\w-]+)$/.exec(pathname);
  if (product?.[1] && findProduct(product[1])) return { page: 'product', productId: product[1] };

  const order = /^\/order\/(\d+)$/.exec(pathname);
  if (order?.[1]) return { page: 'order', orderId: order[1] };

  return undefined;
}
