import { cartChangeEvent, cartItems } from './cart.ts';

const refreshMs = 1000;

/** Shows WebMCP state, registered tools and the cart for humans; enabled by `?debug`. */
export function showDebugPanel(panel: HTMLElement): void {
  panel.hidden = false;

  const refresh = async () => {
    const modelContext = document.modelContext;
    const tools = modelContext ? (await modelContext.getTools()).map((tool) => tool.name) : [];
    panel.textContent = [
      `WebMCP: ${modelContext ? 'on' : 'off'}`,
      `tools: ${tools.length ? tools.join(', ') : '-'}`,
      `cart: ${JSON.stringify(cartItems())}`,
    ].join('\n');
  };

  void refresh();
  window.addEventListener(cartChangeEvent, () => void refresh());
  setInterval(() => void refresh(), refreshMs);
}
