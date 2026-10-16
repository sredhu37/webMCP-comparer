import {
  categories,
  colors,
  findProduct,
  formatPrice,
  popularProductIds,
  searchProducts,
  type Product,
  type SearchFilters,
} from './catalog.ts';
import { addToCart, cartItems, cartTotal, lastOrder, placeOrder, type Buyer } from './cart.ts';
import { html, type Html } from './html.ts';
import { swatch } from './illustration.ts';
import type { Route } from './routes.ts';
import { isAgentSubmit } from './webmcp.ts';

export interface Page {
  title: string;
  body: Html;
  /** Wires up event handlers once the body is in the document. */
  attach?: (root: HTMLElement) => void;
}

export function pageFor(route: Route | undefined, url: URL): Page {
  switch (route?.page) {
    case 'home':
      return homePage();
    case 'search':
      return searchPage(url.searchParams);
    case 'product': {
      const product = findProduct(route.productId);
      return product ? productPage(product) : notFoundPage();
    }
    case 'cart':
      return cartPage();
    case 'checkout':
      return checkoutPage();
    case 'order':
      return orderPage(route.orderId);
    case undefined:
      return notFoundPage();
  }
}

function formField(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function productImage(product: Product, size: number): Html {
  return html`<img
    class="product-image"
    src="/images/${product.id}.svg"
    alt="${product.alt}"
    width="${size}"
    height="${size}"
  />`;
}

function productMeta(product: Product): Html {
  return html`<p class="meta">
    <span class="swatch" style="background: ${swatch(product.color)}"></span>
    ${product.color} · ${product.category}
  </p>`;
}

function productCard(product: Product): Html {
  return html`<article class="card">
    <a href="/products/${product.id}">${productImage(product, 154)}</a>
    <a class="name" href="/products/${product.id}">${product.name}</a>
    <p class="price">${formatPrice(product.price)}</p>
    ${productMeta(product)}
  </article>`;
}

function options(name: string, values: readonly string[], selected: string): Html {
  return html`<option value="">Any ${name}</option>
    ${values.map(
      (value) =>
        html`<option value="${value}" ${value === selected ? html`selected` : ''}>
          ${value}
        </option>`,
    )}`;
}

function filtersForm(params: URLSearchParams): Html {
  const value = (name: string) => params.get(name) ?? '';
  return html`<form class="filters" action="/search" role="search">
    <input
      name="query"
      type="search"
      placeholder="Search"
      aria-label="Search"
      value="${value('query')}"
    />
    <select name="category" aria-label="Category">
      ${options('category', categories, value('category'))}
    </select>
    <select name="color" aria-label="Colour">
      ${options('colour', colors, value('color'))}
    </select>
    <input
      name="maxPrice"
      inputmode="decimal"
      size="8"
      placeholder="Max price"
      aria-label="Max price in EUR"
      value="${value('maxPrice')}"
    />
    <button type="submit">Search</button>
  </form>`;
}

function homePage(): Page {
  const popular = popularProductIds.flatMap((id) => findProduct(id) ?? []);
  return {
    title: 'Home',
    body: html`<h1>Welcome to Demo Shop</h1>
      ${filtersForm(new URLSearchParams())}
      <h2>Popular</h2>
      <div class="grid">${popular.map(productCard)}</div>`,
  };
}

export function filtersFromParams(params: URLSearchParams): SearchFilters {
  const text = (name: string) => params.get(name)?.trim() || undefined;
  const maxPrice = text('maxPrice');
  return {
    query: text('query'),
    category: text('category'),
    color: text('color'),
    size: text('size'),
    maxPrice: maxPrice === undefined ? undefined : Number(maxPrice.replace(',', '.')),
  };
}

function searchPage(params: URLSearchParams): Page {
  const results = searchProducts(filtersFromParams(params));
  return {
    title: 'Products',
    body: html`<h1>Products</h1>
      ${filtersForm(params)}
      <p>${results.length} ${results.length === 1 ? 'result' : 'results'}, cheapest first</p>
      <div class="grid">${results.map(productCard)}</div>`,
  };
}

function productPage(product: Product): Page {
  return {
    title: product.name,
    body: html`<div class="product">
      ${productImage(product, 320)}
      <div>
        <h1>${product.name}</h1>
        <p class="price">${formatPrice(product.price)}</p>
        ${productMeta(product)}
        <p>${product.description}</p>
        <form id="add-to-cart">
          <label for="size">Size</label>
          <select id="size" name="size">
            ${product.sizes.map((size) => html`<option>${size}</option>`)}
          </select>
          <label for="quantity">Quantity</label>
          <input id="quantity" name="quantity" type="number" value="1" min="1" step="1" />
          <p><button type="submit">Add to cart</button></p>
        </form>
        <p id="added" role="status"></p>
      </div>
    </div>`,
    attach(root) {
      const form = root.querySelector<HTMLFormElement>('#add-to-cart');
      const status = root.querySelector<HTMLElement>('#added');
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const size = formField(data, 'size');
        try {
          addToCart(product.id, size, Number(formField(data, 'quantity')));
          if (status) status.textContent = `Added ${product.name} (${size}) to cart.`;
        } catch (error) {
          if (status) status.textContent = (error as Error).message;
        }
      });
    },
  };
}

function cartPage(): Page {
  const items = cartItems();
  if (items.length === 0) {
    return {
      title: 'Cart',
      body: html`<h1>Your cart</h1>
        <p>Your cart is empty. <a href="/search">Browse all products</a>.</p>`,
    };
  }
  return {
    title: 'Cart',
    body: html`<h1>Your cart</h1>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const product = findProduct(item.productId);
            return html`<tr>
              <td><a href="/products/${item.productId}">${product?.name ?? item.productId}</a></td>
              <td>${item.size}</td>
              <td>${item.quantity}</td>
              <td>${formatPrice((product?.price ?? 0) * item.quantity)}</td>
            </tr>`;
          })}
        </tbody>
      </table>
      <p class="total">Total: ${formatPrice(cartTotal())}</p>
      <p><a class="button" href="/checkout">Checkout</a></p>`,
  };
}

function checkoutPage(): Page {
  const count = cartItems().reduce((n, item) => n + item.quantity, 0);
  if (count === 0) {
    return {
      title: 'Checkout',
      body: html`<h1>Checkout</h1>
        <p>Your cart is empty. <a href="/search">Browse all products</a>.</p>`,
    };
  }
  return {
    title: 'Checkout',
    body: html`<h1>Checkout</h1>
      <p>${count} ${count === 1 ? 'item' : 'items'}, total ${formatPrice(cartTotal())}</p>
      <form
        id="checkout"
        toolname="checkout"
        tooldescription="Place the order for everything currently in the cart. Requires the buyer's full name, email and shipping address."
        toolautosubmit
      >
        <label for="name">Full name</label>
        <input
          id="name"
          name="name"
          type="text"
          autocomplete="name"
          required
          toolparamdescription="Buyer's full name"
        />
        <label for="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          required
          toolparamdescription="Buyer's email address"
        />
        <label for="address">Address</label>
        <input
          id="address"
          name="address"
          type="text"
          autocomplete="street-address"
          required
          toolparamdescription="Shipping address on one line"
        />
        <p><button type="submit">Place order</button></p>
      </form>`,
    attach(root) {
      const form = root.querySelector<HTMLFormElement>('#checkout');
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const buyer: Buyer = {
          name: formField(data, 'name'),
          email: formField(data, 'email'),
          address: formField(data, 'address'),
        };
        const order = placeOrder(buyer);
        const confirmation = `/order/${order.id}`;
        if (isAgentSubmit(event)) {
          event.respondWith(Promise.resolve({ orderId: order.id, total: order.total }));
          setTimeout(() => location.assign(confirmation), 50);
        } else {
          location.assign(confirmation);
        }
      });
    },
  };
}

function orderPage(orderId: string): Page {
  const order = lastOrder();
  if (order?.id !== orderId) {
    return { title: 'Order not found', body: html`<h1>Order not found</h1>` };
  }
  return {
    title: `Order ${order.id}`,
    body: html`<h1>Order placed #${order.id}</h1>
      <p>
        Thank you, ${order.name}. Total ${formatPrice(order.total)}. Confirmation sent to
        ${order.email}.
      </p>
      <ul>
        ${order.items.map((item) => html`<li>${item.quantity} x ${item.name} (${item.size})</li>`)}
      </ul>
      <p>Shipping to ${order.address}.</p>`,
  };
}

function notFoundPage(): Page {
  return {
    title: 'Page not found',
    body: html`<h1>Page not found</h1>
      <p><a href="/">Back to the shop</a></p>`,
  };
}
