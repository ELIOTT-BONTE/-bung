/**
 * The one door into inference.
 *
 * Callers only ever use `generateText`. Which backend answers is decided here
 * by walking a chain — the free hosted providers in order, then the local
 * engine the user picked — so adding, removing or swapping a backend never
 * touches a mode screen.
 *
 * Loading is also centralised, and only ever applies to the local engine. A
 * model download can take minutes, and the screen that triggered it is often
 * not the screen the user is looking at when it finishes, so every load goes
 * through `ensureReady` and publishes progress to a module-level emitter that
 * any component can subscribe to. Crucially, `generateText` only reaches for
 * that loader when every hosted provider has declined, so a working API key
 * means no download at all.
 */

import { geminiBackend } from './backends/gemini';
import { groqBackend } from './backends/groq';
import { mistralBackend } from './backends/mistral';
import { mockBackend } from './backends/mock';
import { webllmBackend } from './backends/webllm';
import { wllamaBackend } from './backends/wllama';
import { runChainDetailed, type ChainDeps, type ChainResult } from './chain';
import { hasApiKey } from './keys';
import { GERMAN_TUTOR_SYSTEM_PROMPT } from './prompts';
import { schemaForPrompt } from './responseSchemas';
import { samplingForPrompt } from './sampling';
import {
  HOSTED_TIERS,
  LOCAL_TIERS,
  type BackendStatus,
  type HostedInferenceBackend,
  type HostedProviderId,
  type InferenceBackend,
  type InferenceOptions,
  type InferenceTier,
  type LoadProgress,
  type LoadProgressListener,
  type LocalInferenceBackend,
  type LocalInferenceTier,
} from './types';

/**
 * Split by kind rather than typed as one flat record, so `listLocalBackends`
 * and `listHostedBackends` return tiers narrow enough to use without a cast.
 */
const BACKENDS: Record<HostedProviderId, HostedInferenceBackend> &
  Record<LocalInferenceTier, LocalInferenceBackend> = {
  mistral: mistralBackend,
  gemini: geminiBackend,
  groq: groqBackend,
  webgpu: webllmBackend,
  wasm: wllamaBackend,
  mock: mockBackend,
};

/**
 * Which engine answers when no hosted provider can — never a hosted provider
 * itself. Defaults to the mock tier so a fresh page load can never blow up
 * before the app shell has read the user's saved choice out of storage.
 */
let activeLocalTier: LocalInferenceTier = 'mock';

const tierListeners = new Set<(tier: LocalInferenceTier) => void>();

export function getBackend(tier: InferenceTier): InferenceBackend {
  return BACKENDS[tier];
}

export function listBackends(): InferenceBackend[] {
  return [...HOSTED_TIERS, ...LOCAL_TIERS].map((tier) => BACKENDS[tier]);
}

/** The engines that can be chosen as the last resort, for the tier picker. */
export function listLocalBackends(): LocalInferenceBackend[] {
  return LOCAL_TIERS.map((tier) => BACKENDS[tier]);
}

/** The providers the chain tries first, in the order it tries them. */
export function listHostedBackends(): HostedInferenceBackend[] {
  return HOSTED_TIERS.map((tier) => BACKENDS[tier]);
}

export function getActiveTier(): LocalInferenceTier {
  return activeLocalTier;
}

export function getActiveBackend(): InferenceBackend {
  return BACKENDS[activeLocalTier];
}

export function setActiveTier(tier: LocalInferenceTier): void {
  if (activeLocalTier === tier) return;
  activeLocalTier = tier;
  inFlightLoad = null;
  publishLoadState({
    tier,
    status: BACKENDS[tier].getStatus(),
    progress: null,
    error: null,
  });
  for (const listener of tierListeners) listener(tier);
}

export function subscribeToActiveTier(listener: (tier: LocalInferenceTier) => void): () => void {
  tierListeners.add(listener);
  return () => tierListeners.delete(listener);
}

/** Everything a UI needs to describe what the model is doing right now. */
export interface LoadState {
  tier: InferenceTier;
  status: BackendStatus;
  progress: LoadProgress | null;
  error: Error | null;
}

let loadState: LoadState = {
  tier: activeLocalTier,
  status: 'unloaded',
  progress: null,
  error: null,
};

const loadListeners = new Set<(state: LoadState) => void>();

function publishLoadState(next: LoadState): void {
  loadState = next;
  for (const listener of loadListeners) listener(next);
}

export function getLoadState(): LoadState {
  return loadState;
}

export function subscribeToLoadProgress(listener: (state: LoadState) => void): () => void {
  loadListeners.add(listener);
  return () => loadListeners.delete(listener);
}

/**
 * Deduplicates concurrent loads. Three modes mounting at once, or a mode and
 * the settings screen both asking for the model, must not start two downloads.
 */
let inFlightLoad: { tier: InferenceTier; modelId: string | undefined; promise: Promise<void> } | null =
  null;

export interface EnsureReadyOptions {
  /** Loads a specific model instead of the tier default, e.g. the fallback. */
  modelId?: string;
  /** Extra listener for callers that want progress inline as well. */
  onProgress?: LoadProgressListener;
}

/**
 * Resolves once the local tier can answer a `generate` call. Safe to call on
 * every generation: it is a no-op once the model is loaded.
 */
export function ensureReady(options?: EnsureReadyOptions): Promise<void> {
  const tier = activeLocalTier;
  const backend = BACKENDS[tier];

  if (backend.getStatus() === 'ready' && !options?.modelId) return Promise.resolve();

  if (inFlightLoad && inFlightLoad.tier === tier && inFlightLoad.modelId === options?.modelId) {
    return inFlightLoad.promise;
  }

  const modelId = options?.modelId;

  const promise = (async () => {
    publishLoadState({
      tier,
      status: 'loading',
      progress: { fraction: null, label: 'Starting' },
      error: null,
    });

    try {
      await backend.load({
        modelId,
        onProgress: (progress) => {
          options?.onProgress?.(progress);
          // A tier switch mid-download must not resurrect the old tier's bar.
          if (activeLocalTier !== tier) return;
          publishLoadState({ tier, status: 'loading', progress, error: null });
        },
      });
      publishLoadState({ tier, status: 'ready', progress: null, error: null });
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      publishLoadState({ tier, status: 'error', progress: null, error });
      throw error;
    } finally {
      // Anything with the same target was deduplicated into this very call.
      if (inFlightLoad?.tier === tier && inFlightLoad?.modelId === modelId) inFlightLoad = null;
    }
  })();

  inFlightLoad = { tier, modelId, promise };
  return promise;
}

/** Frees the active local tier's model and its memory. */
export async function unloadActiveBackend(): Promise<void> {
  inFlightLoad = null;
  await getActiveBackend().unload();
  publishLoadState({ tier: activeLocalTier, status: 'unloaded', progress: null, error: null });
}

const chainDeps: ChainDeps = {
  getBackend,
  hasApiKey,
  ensureLocalReady: () => ensureReady(),
};

/**
 * Runs a prompt and reports which candidate answered it.
 *
 * Prompts declare their intent on the first line, so both the schema that
 * constrains the reply and the decoding settings it wants are looked up here
 * rather than passed down through every mode pipeline.
 */
export async function generateTextDetailed(
  prompt: string,
  options?: InferenceOptions,
): Promise<ChainResult> {
  return runChainDetailed(
    prompt,
    {
      systemPrompt: GERMAN_TUTOR_SYSTEM_PROMPT,
      ...samplingForPrompt(prompt),
      ...options,
      schema: options?.schema ?? schemaForPrompt(prompt),
    },
    activeLocalTier,
    chainDeps,
  );
}

export async function generateText(prompt: string, options?: InferenceOptions): Promise<string> {
  return (await generateTextDetailed(prompt, options)).text;
}

export * from './capabilities';
export * from './chain';
export * from './keys';
export * from './prompts';
export * from './responseSchemas';
export * from './sampling';
export * from './schemas';
export * from './types';
export { ModelOutputError } from './parse';
