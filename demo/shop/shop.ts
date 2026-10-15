import {
  cartChangeEvent,
  cartCount,
  cartItems,
  lastOrder,
  type CartItem,
  type Order,
} from './cart.ts';
import { showDebugPanel } from './debug.ts';
import { pageFor } from './pages.ts';
import { matchRoute } from './routes.ts';
import { registerShopTools } from './webmcp.ts';

declare global {
  interface Window {
    /** Read-only view of the shop state, used by Success check scripts. */
    shop: { cart(): CartItem[]; lastOrder(): Order | null };
  }
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in the page shell.`);
  return found;
}

function renderCartLink(): void {
  element('cart-link').textContent = `Cart (${cartCount()})`;
}

const url = new URL(location.href);
const page = pageFor(matchRoute(url.pathname), url);
const main = element('app');

document.title = `${page.title} | Demo Shop`;
main.innerHTML = page.body.value;
page.attach?.(main);

renderCartLink();
window.addEventListener(cartChangeEvent, renderCartLink);
window.addEventListener('storage', renderCartLink);

window.shop = { cart: cartItems, lastOrder };

if (document.modelContext) registerShopTools(document.modelContext);

if (url.searchParams.has('debug')) showDebugPanel(element('debug'));
