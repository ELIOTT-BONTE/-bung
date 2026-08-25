import { describe, expect, it, vi } from 'vitest';
import {
  AllCandidatesFailedError,
  chainOrder,
  runChain,
  type ChainDeps,
} from './chain';
import { ModelOutputError } from './parse';
import {
  HostedProviderError,
  ModelLoadError,
  type HostedProviderId,
  type InferenceBackend,
  type InferenceTier,
} from './types';

const HOSTED: InferenceTier[] = ['mistral', 'gemini', 'groq'];

function fakeBackend(
  tier: InferenceTier,
  hosted: boolean,
  generate: (prompt: string) => Promise<string>,
): InferenceBackend {
  return {
    tier,
    hosted,
    label: tier,
    description: '',
    model: { id: `${tier}-model`, approximateDownloadMb: null, approximateVramMb: null },
    fallbackModel: null,
    getStatus: () => 'ready',
    getLoadedModelId: () => `${tier}-model`,
    isCached: async () => true,
    load: async () => {},
    generate: (prompt) => generate(prompt),
    unload: async () => {},
  };
}

function rateLimited(provider: HostedProviderId): HostedProviderError {
  return new HostedProviderError({
    provider,
    status: 429,
    retryable: true,
    message: `${provider} free-tier rate limit reached`,
  });
}

interface Harness {
  deps: ChainDeps;
  calls: InferenceTier[];
  ensureLocalReady: ReturnType<typeof vi.fn>;
}

/**
 * Builds a chain over fake backends. `behaviour` maps a tier to what it does;
 * anything unlisted answers successfully.
 */
function harness(options: {
  keys?: InferenceTier[];
  behaviour?: Partial<Record<InferenceTier, () => Promise<string>>>;
  localLoadError?: Error;
}): Harness {
  const calls: InferenceTier[] = [];
  const keys = new Set(options.keys ?? HOSTED);

  const ensureLocalReady = vi.fn(async () => {
    if (options.localLoadError) throw options.localLoadError;
  });

  const deps: ChainDeps = {
    getBackend: (tier) =>
      fakeBackend(tier, HOSTED.includes(tier), async () => {
        calls.push(tier);
        const behaviour = options.behaviour?.[tier];
        if (behaviour) return behaviour();
        return `answer from ${tier}`;
      }),
    hasApiKey: (provider) => keys.has(provider),
    ensureLocalReady,
  };

  return { deps, calls, ensureLocalReady };
}

describe('chainOrder', () => {
  it('puts the hosted providers first and the local engine last', () => {
    expect(chainOrder('webgpu')).toEqual(['mistral', 'gemini', 'groq', 'webgpu']);
  });

  it('uses whichever local engine was chosen', () => {
    expect(chainOrder('mock').at(-1)).toBe('mock');
    expect(chainOrder('wasm').at(-1)).toBe('wasm');
  });
});

describe('runChain', () => {
  it('answers from the first provider and asks no one else', async () => {
    const { deps, calls } = harness({});

    await expect(runChain('Hallo', {}, 'wasm', deps)).resolves.toBe('answer from mistral');
    expect(calls).toEqual(['mistral']);
  });

  it('never loads the local model when a hosted provider answers', async () => {
    const { deps, ensureLocalReady } = harness({});

    await runChain('Hallo', {}, 'webgpu', deps);

    expect(ensureLocalReady).not.toHaveBeenCalled();
  });

  it('skips a provider with no key without spending a request', async () => {
    const { deps, calls } = harness({ keys: ['groq'] });

    await expect(runChain('Hallo', {}, 'wasm', deps)).resolves.toBe('answer from groq');
    expect(calls).toEqual(['groq']);
  });

  it('moves on when a provider is rate limited', async () => {
    const { deps, calls } = harness({
      behaviour: {
        mistral: () => Promise.reject(rateLimited('mistral')),
        gemini: () => Promise.reject(rateLimited('gemini')),
      },
    });

    await expect(runChain('Hallo', {}, 'wasm', deps)).resolves.toBe('answer from groq');
    expect(calls).toEqual(['mistral', 'gemini', 'groq']);
  });

  it('moves on when a reply cannot be parsed', async () => {
    const { deps, calls } = harness({
      behaviour: {
        mistral: () => Promise.reject(new ModelOutputError('no JSON found', '...')),
      },
    });

    await expect(runChain('Hallo', {}, 'wasm', deps)).resolves.toBe('answer from gemini');
    expect(calls).toEqual(['mistral', 'gemini']);
  });

  it('falls back to the local engine only once every hosted provider has declined', async () => {
    const { deps, calls, ensureLocalReady } = harness({
      behaviour: {
        mistral: () => Promise.reject(rateLimited('mistral')),
        gemini: () => Promise.reject(rateLimited('gemini')),
        groq: () => Promise.reject(rateLimited('groq')),
      },
    });

    await expect(runChain('Hallo', {}, 'wasm', deps)).resolves.toBe('answer from wasm');
    expect(calls).toEqual(['mistral', 'gemini', 'groq', 'wasm']);
    expect(ensureLocalReady).toHaveBeenCalledOnce();
  });

  it('reaches the local engine immediately when no keys are configured', async () => {
    const { deps, calls } = harness({ keys: [] });

    await expect(runChain('Hallo', {}, 'mock', deps)).resolves.toBe('answer from mock');
    expect(calls).toEqual(['mock']);
  });

  it('rethrows the caller\u2019s abort instead of burning the rest of the chain', async () => {
    const abort = new DOMException('Generation aborted', 'AbortError');
    const { deps, calls } = harness({ behaviour: { mistral: () => Promise.reject(abort) } });

    await expect(runChain('Hallo', {}, 'wasm', deps)).rejects.toBe(abort);
    expect(calls).toEqual(['mistral']);
  });

  it('treats a local model that will not load as a failed candidate', async () => {
    const { deps } = harness({
      keys: [],
      localLoadError: new ModelLoadError({
        tier: 'webgpu',
        modelId: 'big',
        kind: 'out-of-memory',
        message: 'Not enough GPU memory',
      }),
    });

    await expect(runChain('Hallo', {}, 'webgpu', deps)).rejects.toThrow(AllCandidatesFailedError);
  });

  it('reports every attempt when nothing can answer', async () => {
    const { deps } = harness({
      keys: ['gemini', 'groq'],
      behaviour: {
        gemini: () => Promise.reject(rateLimited('gemini')),
        groq: () => Promise.reject(new Error('Groq is unavailable (HTTP 503)')),
        mock: () => Promise.reject(new Error('fixtures missing')),
      },
    });

    const error = await runChain('Hallo', {}, 'mock', deps).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AllCandidatesFailedError);
    const { attempts, message } = error as AllCandidatesFailedError;

    expect(attempts.map((attempt) => [attempt.tier, attempt.outcome])).toEqual([
      ['mistral', 'skipped'],
      ['gemini', 'failed'],
      ['groq', 'failed'],
      ['mock', 'failed'],
    ]);
    expect(message).toContain('no API key');
    expect(message).toContain('rate limit');
    expect(message).toContain('HTTP 503');
  });
});
