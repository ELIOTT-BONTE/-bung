/**
 * The fallback chain.
 *
 * Free hosted tiers are fast, good at German and constantly rate-limited, so no
 * single one of them can be relied on. They are tried in order, and the local
 * engine sits at the end as the candidate that cannot run out of quota.
 *
 * Ordering and failure policy live here; the backends and the loader are
 * injected, which keeps this walk testable without a network, a key or a GPU,
 * and keeps `index.ts` from importing itself in a circle.
 */

import { isAbortError, isHostedTier, HOSTED_TIERS } from './types';
import type {
  HostedProviderId,
  InferenceBackend,
  InferenceOptions,
  InferenceTier,
  LocalInferenceTier,
} from './types';

export type ChainOutcome = 'skipped' | 'failed';

export interface ChainAttempt {
  tier: InferenceTier;
  label: string;
  outcome: ChainOutcome;
  reason: string;
}

/**
 * Every candidate declined. Carries the whole walk, because "the model failed"
 * is useless to a learner staring at an empty screen while "Mistral has no key,
 * Gemini is rate limited, Groq is down" tells them what to do.
 */
export class AllCandidatesFailedError extends Error {
  readonly attempts: readonly ChainAttempt[];

  constructor(attempts: readonly ChainAttempt[]) {
    const detail = attempts.map((attempt) => `${attempt.label}: ${attempt.reason}`).join('; ');
    super(
      attempts.length === 0
        ? 'No inference candidate was configured.'
        : `No model could answer. ${detail}`,
    );
    this.name = 'AllCandidatesFailedError';
    this.attempts = attempts;
  }
}

export function isAllCandidatesFailedError(error: unknown): error is AllCandidatesFailedError {
  return error instanceof AllCandidatesFailedError;
}

/** Hosted providers first, in `HOSTED_TIERS` order, then the local engine. */
export function chainOrder(localTier: LocalInferenceTier): InferenceTier[] {
  return [...HOSTED_TIERS, localTier];
}

export interface ChainDeps {
  getBackend(tier: InferenceTier): InferenceBackend;
  /** True when the provider has a key and is therefore worth attempting. */
  hasApiKey(provider: HostedProviderId): boolean;
  /**
   * Loads the local model. Called only when the walk actually reaches the local
   * candidate, so a hosted answer never triggers a multi-gigabyte download.
   */
  ensureLocalReady(tier: LocalInferenceTier): Promise<void>;
}

function reasonFor(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return String(error);
}

export interface ChainResult {
  text: string;
  /** Which candidate actually answered. */
  tier: InferenceTier;
  label: string;
  /** The candidates that declined first, in the order they were tried. */
  attempts: readonly ChainAttempt[];
}

/**
 * Walks the candidates and returns the first answer along with its source.
 *
 * A candidate is abandoned for any failure other than the caller's own abort:
 * a rejected key, a rate limit, an unreachable host, an unloadable model, or a
 * reply the parsers could not use. An abort is the user's decision and is
 * rethrown untouched rather than burning the rest of the chain.
 */
export async function runChainDetailed(
  prompt: string,
  options: InferenceOptions,
  localTier: LocalInferenceTier,
  deps: ChainDeps,
): Promise<ChainResult> {
  const attempts: ChainAttempt[] = [];

  for (const tier of chainOrder(localTier)) {
    const backend = deps.getBackend(tier);
    const hosted = isHostedTier(tier);

    if (hosted && !deps.hasApiKey(tier)) {
      attempts.push({ tier, label: backend.label, outcome: 'skipped', reason: 'no API key' });
      continue;
    }

    try {
      if (!hosted) await deps.ensureLocalReady(localTier);
      const text = await backend.generate(prompt, options);
      return { text, tier, label: backend.label, attempts };
    } catch (error) {
      if (isAbortError(error)) throw error;
      attempts.push({
        tier,
        label: backend.label,
        outcome: 'failed',
        reason: reasonFor(error),
      });
    }
  }

  throw new AllCandidatesFailedError(attempts);
}

/** The common case, for callers that do not care which candidate answered. */
export async function runChain(
  prompt: string,
  options: InferenceOptions,
  localTier: LocalInferenceTier,
  deps: ChainDeps,
): Promise<string> {
  return (await runChainDetailed(prompt, options, localTier, deps)).text;
}
