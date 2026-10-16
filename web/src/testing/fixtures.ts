/** Shared test data shaped like the app server's answers. */
import type { Defaults, KeysInfo, ModelsInfo } from '../api.ts';

export const SUITE = `scenarios:
  - id: first
    prompt: Find the red shirt.
  - id: second
    prompt: Add it to the cart.
  - id: third
    path: /checkout
    prompt: Check out.
`;

export const DEFAULTS: Defaults = {
  siteUrl: 'http://localhost:4000',
  suite: SUITE,
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  attempts: 1,
  maxAttempts: 100,
  limits: { maxSteps: 50, maxDurationMs: 300_000, maxCostUsd: 2 },
};

export const MODELS: ModelsInfo = {
  effort: 'medium',
  providers: [
    { id: 'anthropic', name: 'Anthropic', defaultModel: 'claude-haiku-5-5' },
    { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-6-luna' },
  ],
  models: [
    {
      id: 'claude-haiku-5-5',
      provider: 'anthropic',
      name: 'Haiku 5.5',
      label: 'recommended',
      default: true,
    },
    {
      id: 'claude-sonnet-5-5',
      provider: 'anthropic',
      name: 'Sonnet 5.5',
      label: 'ok',
      default: false,
    },
    {
      id: 'claude-opus-5-5',
      provider: 'anthropic',
      name: 'Opus 5.5',
      label: 'not recommended',
      default: false,
    },
    {
      id: 'gpt-6-luna',
      provider: 'openai',
      name: 'gpt-6-luna',
      label: 'recommended',
      default: true,
    },
    { id: 'gpt-6.1-sol', provider: 'openai', name: 'gpt-6.1-sol', label: 'ok', default: false },
    {
      id: 'gpt-5.6-sol',
      provider: 'openai',
      name: 'gpt-5.6-sol',
      label: 'not recommended',
      default: false,
    },
  ],
};

export const KEYS_IN_ENV: KeysInfo = {
  anthropic: { envVar: 'ANTHROPIC_API_KEY', inEnv: true, inSession: false },
  openai: { envVar: 'OPENAI_API_KEY', inEnv: false, inSession: false },
};
