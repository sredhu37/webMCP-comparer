import { findProduct } from './catalog.ts';

export interface CartItem {
  productId: string;
  size: string;
  quantity: number;
}

export interface OrderItem extends CartItem {
  name: string;
  price: number;
}

export interface Buyer {
  name: string;
  email: string;
  address: string;
}

export interface Order extends Buyer {
  id: string;
  items: OrderItem[];
  total: number;
  placedAt: string;
}

const cartKey = 'shop.cart';
const lastOrderKey = 'shop.lastOrder';

/** Fired on window whenever the cart changes. */
export const cartChangeEvent = 'shop:cartchange';

function read<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

function saveCart(items: CartItem[]): void {
  localStorage.setItem(cartKey, JSON.stringify(items));
  window.dispatchEvent(new Event(cartChangeEvent));
}

export function cartItems(): CartItem[] {
  const items = read<unknown>(cartKey, []);
  return Array.isArray(items) ? (items as CartItem[]) : [];
}

export function lastOrder(): Order | null {
  return read<Order | null>(lastOrderKey, null);
}

export function cartCount(): number {
  return cartItems().reduce((count, item) => count + item.quantity, 0);
}

function unitPrice(productId: string): number {
  return findProduct(productId)?.price ?? 0;
}

export function cartTotal(): number {
  return roundCents(
    cartItems().reduce((total, item) => total + unitPrice(item.productId) * item.quantity, 0),
  );
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Adds a product to the cart; throws an Error with a readable message on bad input. */
export function addToCart(productId: string, size: string, quantity = 1): CartItem[] {
  const product = findProduct(productId);
  if (!product) throw new Error(`Unknown product "${productId}".`);
  if (!product.sizes.includes(size)) {
    throw new Error(
      `Size "${size}" is not available for ${product.name}. Available sizes: ${product.sizes.join(', ')}.`,
    );
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Quantity must be a whole number of at least 1, got ${quantity}.`);
  }

  const items = cartItems();
  const line = items.find((item) => item.productId === productId && item.size === size);
  if (line) {
    line.quantity += quantity;
  } else {
    items.push({ productId, size, quantity });
  }
  saveCart(items);
  return items;
}

function newOrderId(): string {
  const [random = 0] = crypto.getRandomValues(new Uint32Array(1));
  return String(10000 + (random % 90000));
}

/** Turns the cart into the last order and empties the cart. */
export function placeOrder(buyer: Buyer): Order {
  const items = cartItems();
  if (items.length === 0) throw new Error('The cart is empty.');

  const order: Order = {
    id: newOrderId(),
    ...buyer,
    items: items.map((item) => {
      const product = findProduct(item.productId);
      return { ...item, name: product?.name ?? item.productId, price: product?.price ?? 0 };
    }),
    total: cartTotal(),
    placedAt: new Date().toISOString(),
  };
  localStorage.setItem(lastOrderKey, JSON.stringify(order));
  saveCart([]);
  return order;
}
