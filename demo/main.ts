import { createDemoApp } from './app.ts';

const port = 4000;

const app = createDemoApp();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: 'localhost', port });
console.log(`Demo shop on http://localhost:${port}`);
