import { createApp } from './app.ts';

const port = 3000;
const dev = process.argv.includes('--dev');

const app = await createApp({ dev });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: 'localhost', port });
console.log(`webMCP-comparer${dev ? ' (dev)' : ''} on http://localhost:${port}`);
