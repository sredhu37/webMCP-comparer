import { fileURLToPath } from 'node:url';

const fromRoot = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

export const viteConfigFile = fromRoot('vite.config.ts');
export const webRoot = fromRoot('web');
export const webDist = fromRoot('dist/web');
export const runsDir = fromRoot('runs');
export const envFile = fromRoot('.env');
export const sampleSuiteFile = fromRoot('demo/sample-suite.yaml');
