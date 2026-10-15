import Fastify, { type FastifyInstance } from 'fastify';

const placeholderPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demo shop</title>
  </head>
  <body>
    <h1>Demo shop</h1>
    <p>The shop is coming soon.</p>
  </body>
</html>
`;

export function createDemoApp(): FastifyInstance {
  const app = Fastify();

  app.get('/favicon.ico', (_request, reply) => reply.code(204).send());
  app.get('/', (_request, reply) => reply.type('text/html; charset=utf-8').send(placeholderPage));

  return app;
}
