import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { viteConfigFile, webDist } from './paths.ts';

export interface AppOptions {
  /** Serve web/ through Vite with hot reload instead of the production build. */
  dev?: boolean;
  /** Folder holding the production build of web/. */
  webDist?: string;
}

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify();

  app.get('/api/health', () => ({ ok: true }));

  if (options.dev) {
    await serveWithVite(app);
  } else {
    await serveBuild(app, options.webDist ?? webDist);
  }

  return app;
}

function isApiUrl(url: string): boolean {
  return url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');
}

async function serveWithVite(app: FastifyInstance): Promise<void> {
  const [{ createServer }, { default: middie }] = await Promise.all([
    import('vite'),
    import('@fastify/middie'),
  ]);
  const vite = await createServer({
    configFile: viteConfigFile,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server: app.server } },
  });
  app.addHook('preClose', () => vite.close());

  await app.register(middie);
  app.use((req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    if (isApiUrl(req.url ?? '/')) {
      next();
    } else {
      vite.middlewares(req, res, next);
    }
  });
}

async function serveBuild(app: FastifyInstance, root: string): Promise<void> {
  if (!existsSync(join(root, 'index.html'))) {
    throw new Error(`No web build in ${root}. Run "npm run build" first.`);
  }

  await app.register(fastifyStatic, { root });

  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !isApiUrl(request.url)) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}
