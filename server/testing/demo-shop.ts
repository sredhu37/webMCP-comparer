import type { AddressInfo } from 'node:net';
import { createDemoApp } from '../../demo/app.ts';

export interface RunningDemoShop {
  baseUrl: string;
  close(): Promise<void>;
}

/** The demo shop on a random local port, for integration tests. */
export async function startDemoShop(): Promise<RunningDemoShop> {
  const app = createDemoApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  return {
    baseUrl: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`,
    close: () => app.close(),
  };
}
