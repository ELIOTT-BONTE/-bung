import { describe, expect, it, vi } from 'vitest';
import { isAbortError, isHostedProviderError, type HostedProviderError } from '../types';
import { postJson } from './hostedFetch';
import type { HostedRequest } from './hostedRequests';

const request: HostedRequest = {
  url: 'https://example.invalid/v1/chat',
  headers: { authorization: 'Bearer sk-test', 'content-type': 'application/json' },
  body: { model: 'test', messages: [] },
};

function responding(body: string, status: number): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

/** A provider that accepts the request and then never answers. */
const hanging: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted', 'AbortError')),
    );
  });

async function failureFrom(promise: Promise<unknown>): Promise<HostedProviderError> {
  const error = await promise.catch((caught: unknown) => caught);
  if (!isHostedProviderError(error)) {
    throw new Error(`Expected a HostedProviderError, got ${String(error)}`);
  }
  return error;
}

describe('postJson', () => {
  it('returns the parsed body on success', async () => {
    const fetchImpl = responding(JSON.stringify({ choices: [{ message: { content: 'ja' } }] }), 200);

    await expect(postJson({ provider: 'mistral', request, fetchImpl })).resolves.toEqual({
      choices: [{ message: { content: 'ja' } }],
    });
  });

  it('posts the request as JSON without cookies', async () => {
    const fetchImpl = responding('{}', 200);

    await postJson({ provider: 'mistral', request, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      request.url,
      expect.objectContaining({
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        credentials: 'omit',
      }),
    );
  });

  it('marks a rate limit as worth retrying later', async () => {
    const fetchImpl = responding('{}', 429);

    const error = await failureFrom(postJson({ provider: 'groq', request, fetchImpl }));

    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('rate limit');
  });

  it('marks a rejected key as needing a human, not a retry', async () => {
    const fetchImpl = responding('{}', 401);

    const error = await failureFrom(postJson({ provider: 'gemini', request, fetchImpl }));

    expect(error.retryable).toBe(false);
    expect(error.message).toContain('rejected the API key');
  });

  it('says so when the model is unknown, which is how a retirement shows up', async () => {
    const fetchImpl = responding('{}', 404);

    const error = await failureFrom(postJson({ provider: 'groq', request, fetchImpl }));

    expect(error.message).toContain('retired');
  });

  it.each([
    [400, false],
    [408, true],
    [500, true],
    [503, true],
  ])('classifies HTTP %i with retryable=%s', async (status, retryable) => {
    const fetchImpl = responding('{}', status);

    const error = await failureFrom(postJson({ provider: 'mistral', request, fetchImpl }));

    expect(error.retryable).toBe(retryable);
  });

  it('surfaces the provider\u2019s own explanation when it sends one', async () => {
    const fetchImpl = responding(
      JSON.stringify({ error: { message: 'Invalid schema: additionalProperties required' } }),
      400,
    );

    const error = await failureFrom(postJson({ provider: 'mistral', request, fetchImpl }));

    expect(error.message).toContain('Invalid schema: additionalProperties required');
  });

  it('falls back to the raw body when the error is not JSON', async () => {
    const fetchImpl = responding('upstream connect error', 502);

    const error = await failureFrom(postJson({ provider: 'groq', request, fetchImpl }));

    expect(error.message).toContain('upstream connect error');
  });

  it('reports a blocked or unreachable host without a status', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const error = await failureFrom(postJson({ provider: 'mistral', request, fetchImpl }));

    expect(error.status).toBeNull();
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('network or CORS failure');
  });

  it('gives up on a provider that stops answering', async () => {
    const error = await failureFrom(
      postJson({ provider: 'gemini', request, timeoutMs: 20, fetchImpl: hanging }),
    );

    expect(error.status).toBeNull();
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('did not answer');
  });

  it('rethrows the caller\u2019s abort so it is not mistaken for a provider failure', async () => {
    const controller = new AbortController();

    const promise = postJson({
      provider: 'mistral',
      request,
      signal: controller.signal,
      fetchImpl: hanging,
    });
    controller.abort();

    const error = await promise.catch((caught: unknown) => caught);

    expect(isHostedProviderError(error)).toBe(false);
    expect(isAbortError(error)).toBe(true);
  });

  it('treats a success body that is not JSON as a provider failure', async () => {
    const fetchImpl = responding('<html>gateway</html>', 200);

    const error = await failureFrom(postJson({ provider: 'groq', request, fetchImpl }));

    expect(error.message).toContain('not JSON');
  });
});
