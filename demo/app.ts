import { readFile } from 'node:fs/promises';
import Fastify, { type FastifyInstance } from 'fastify';
import { findProduct } from './shop/catalog.ts';
import { productIllustration } from './shop/illustration.ts';
import { matchRoute } from './shop/routes.ts';

const shopDir = new URL('./shop/', import.meta.url);

/** Every page is this shell; the browser module renders the content for the URL. */
const pageShell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demo Shop</title>
    <link rel="stylesheet" href="/assets/styles.css" />
    <script type="module" src="/assets/shop.ts"></script>
  </head>
  <body>
    <header>
      <a class="brand" href="/">Demo Shop</a>
      <a href="/search">All products</a>
      <a class="cart" id="cart-link" href="/cart">Cart (0)</a>
    </header>
    <main id="app"></main>
    <div id="debug" hidden></div>
  </body>
</html>
`;

interface Asset {
  type: string;
  body: string;
}

const assetName = /^[a-z][\w-]*\.(ts|css)$/;

/** Browser code is TypeScript in demo/shop/, served with its types stripped. */
async function loadAsset(file: string): Promise<Asset | undefined> {
  if (!assetName.test(file) || file.endsWith('.test.ts')) return undefined;

  let source: string;
  try {
    source = await readFile(new URL(file, shopDir), 'utf8');
  } catch {
    return undefined;
  }

  if (file.endsWith('.css')) return { type: 'text/css; charset=utf-8', body: source };

  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(source, file, { lang: 'ts' });
  return { type: 'text/javascript; charset=utf-8', body: code };
}

export function createDemoApp(): FastifyInstance {
  const app = Fastify();
  const assets = new Map<string, Asset>();

  app.get('/favicon.ico', (_request, reply) => reply.code(204).send());

  app.get<{ Params: { file: string } }>('/assets/:file', async (request, reply) => {
    const { file } = request.params;
    const asset = assets.get(file) ?? (await loadAsset(file));
    if (!asset) return reply.code(404).type('text/plain').send('Not found');
    assets.set(file, asset);
    return reply.type(asset.type).send(asset.body);
  });

  app.get<{ Params: { file: string } }>('/images/:file', (request, reply) => {
    const { file } = request.params;
    const product = file.endsWith('.svg') ? findProduct(file.slice(0, -'.svg'.length)) : undefined;
    if (!product) return reply.code(404).type('text/plain').send('Not found');
    return reply.type('image/svg+xml').send(productIllustration(product));
  });

  app.get('/*', (request, reply) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    return reply
      .code(matchRoute(pathname) ? 200 : 404)
      .type('text/html; charset=utf-8')
      .send(pageShell);
  });

  return app;
}
