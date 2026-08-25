/**
 * The one network call the hosted backends make.
 *
 * Everything a free-tier API can do to us is turned into a `HostedProviderError`
 * here, so the chain above can make a single decision — move on — without
 * knowing anything about HTTP.
 */

import { HostedProviderError, type HostedProviderId } from '../types';
import type { HostedRequest } from './hostedRequests';

/**
 * A hosted call that has not answered in this long is worse than no call at
 * all: the whole point of the chain is to reach a working provider quickly, and
 * a hung socket would otherwise hold the user's screen indefinitely.
 */
export const HOSTED_TIMEOUT_MS = 30_000;

export interface PostJsonOptions {
  provider: HostedProviderId;
  request: HostedRequest;
  /** The caller's abort, e.g. a mode screen unmounting. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Injected in tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * A 4xx means we asked wrong and asking again will fail the same way, with one
 * exception: 408 and 429 are the server telling us to come back later.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function describeStatus(provider: HostedProviderId, status: number): string {
  switch (status) {
    case 401:
    case 403:
      return `${provider} rejected the API key`;
    case 404:
      return `${provider} does not know this model — it may have been retired`;
    case 408:
      return `${provider} timed out`;
    case 429:
      return `${provider} free-tier rate limit reached`;
    default:
      return status >= 500
        ? `${provider} is unavailable (HTTP ${status})`
        : `${provider} rejected the request (HTTP ${status})`;
  }
}

/** Both providers' error bodies nest the useful text under `error.message`. */
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text.trim() === '') return '';

    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } | string };
      const error = parsed.error;
      if (typeof error === 'string') return error;
      if (error && typeof error.message === 'string') return error.message;
    } catch {
      // Not JSON — the raw text is still the best detail available.
    }

    return text.slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * Posts JSON and returns the parsed body.
 *
 * Throws `HostedProviderError` for anything the chain should route around, and
 * rethrows the caller's own abort untouched so a cancelled screen does not get
 * mistaken for a failing provider.
 */
export async function postJson(options: PostJsonOptions): Promise<unknown> {
  const { provider, request, signal, timeoutMs = HOSTED_TIMEOUT_MS } = options;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await doFetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: combined,
      // No cookies are involved, and omitting credentials keeps the request a
      // plain CORS call that these APIs' preflights accept.
      credentials: 'omit',
    });
  } catch (caught) {
    // The caller's abort wins: it is not a provider failure and must not be
    // turned into one, or an unmounting screen would silently burn a provider.
    if (signal?.aborted) throw caught;

    if (timeout.aborted) {
      throw new HostedProviderError({
        provider,
        status: null,
        retryable: true,
        message: `${provider} did not answer within ${Math.round(timeoutMs / 1000)}s`,
        cause: caught,
      });
    }

    // `fetch` rejects with an opaque TypeError for a blocked CORS preflight,
    // DNS failure and an offline device alike; none is distinguishable here.
    throw new HostedProviderError({
      provider,
      status: null,
      retryable: true,
      message: `${provider} could not be reached — network or CORS failure`,
      cause: caught,
    });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const summary = describeStatus(provider, response.status);
    throw new HostedProviderError({
      provider,
      status: response.status,
      retryable: isRetryableStatus(response.status),
      message: detail ? `${summary}: ${detail}` : summary,
    });
  }

  try {
    return await response.json();
  } catch (caught) {
    if (signal?.aborted) throw caught;
    throw new HostedProviderError({
      provider,
      status: response.status,
      retryable: true,
      message: `${provider} returned a body that was not JSON`,
      cause: caught,
    });
  }
}
