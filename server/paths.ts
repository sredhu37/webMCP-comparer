import { fileURLToPath } from 'node:url';

const fromRoot = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

export const viteConfigFile = fromRoot('vite.config.ts');
export const webRoot = fromRoot('web');
export const webDist = fromRoot('dist/web');
