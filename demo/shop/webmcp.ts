import { categories, colors, findProduct, searchProducts, type Product } from './catalog.ts';
import { addToCart, cartItems, cartTotal } from './cart.ts';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface ModelContextTool {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

/** The part of the WebMCP `document.modelContext` API the shop uses. */
export interface ModelContext {
  registerTool(tool: ModelContextTool): void;
  getTools(): Promise<{ name: string }[]>;
}

/** A form submit that WebMCP started on behalf of an agent. */
interface AgentSubmitEvent extends SubmitEvent {
  agentInvoked: true;
  respondWith(result: Promise<unknown>): void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export function isAgentSubmit(event: SubmitEvent): event is AgentSubmitEvent {
  return (event as Partial<AgentSubmitEvent>).agentInvoked === true;
}

function textResult(value: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  };
}

function errorResult(message: string): ToolResult {
  return { ...textResult(message), isError: true };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function productDetails(product: Product) {
  const { id, name, price, color, category, sizes, description } = product;
  return { id, name, price, currency: 'EUR', color, category, sizes, description };
}

function cartSummary() {
  return {
    items: cartItems().map((item) => ({ ...item, name: findProduct(item.productId)?.name })),
    total: cartTotal(),
    currency: 'EUR',
  };
}

const tools: ModelContextTool[] = [
  {
    name: 'search_products',
    description:
      'Search the catalog. Returns matching products sorted by price, cheapest first. All filters are optional.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text, e.g. "shirt" or "red sneakers"' },
        category: { type: 'string', enum: [...categories] },
        color: { type: 'string', enum: [...colors] },
        size: { type: 'string', description: 'Only products available in this size, e.g. "M"' },
        maxPrice: { type: 'number', description: 'Maximum price in EUR' },
      },
    },
    annotations: { readOnlyHint: true },
    execute: (input) =>
      Promise.resolve(
        textResult(
          searchProducts({
            query: optionalString(input.query),
            category: optionalString(input.category),
            color: optionalString(input.color),
            size: optionalString(input.size),
            maxPrice: typeof input.maxPrice === 'number' ? input.maxPrice : undefined,
          }).map(productDetails),
        ),
      ),
  },
  {
    name: 'get_product',
    description: 'Get the details of one product by id, including its available sizes.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Product id, e.g. "red-shirt-basic"' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: true },
    execute: (input) => {
      const id = optionalString(input.id) ?? '';
      const product = findProduct(id);
      return Promise.resolve(
        product ? textResult(productDetails(product)) : errorResult(`Unknown product "${id}".`),
      );
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product in a given size to the cart. Returns the updated cart.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product id, e.g. "red-shirt-basic"' },
        size: { type: 'string', description: 'One of the sizes the product is available in' },
        quantity: { type: 'integer', minimum: 1, default: 1 },
      },
      required: ['productId', 'size'],
    },
    execute: (input) => {
      try {
        addToCart(
          optionalString(input.productId) ?? '',
          optionalString(input.size) ?? '',
          input.quantity === undefined ? 1 : Number(input.quantity),
        );
        return Promise.resolve(textResult(cartSummary()));
      } catch (error) {
        return Promise.resolve(errorResult((error as Error).message));
      }
    },
  },
  {
    name: 'view_cart',
    description: 'Show the cart contents and total.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => Promise.resolve(textResult(cartSummary())),
  },
];

/** Registers the shop's imperative tools; the checkout tool is the declarative form on /checkout. */
export function registerShopTools(modelContext: ModelContext): void {
  for (const tool of tools) modelContext.registerTool(tool);
}
