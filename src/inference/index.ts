/**
 * The one door into inference.
 *
 * Callers only ever use `generateText`. Which backend answers is decided here
 * by the active tier, so adding, removing or swapping a backend never touches
 * a mode screen.
 *
 * Loading is also centralised. A model download can take minutes, and the
 * screen that triggered it is often not the screen the user is looking at when
 * it finishes, so every load goes through `ensureReady` and publishes progress
 * to a module-level emitter that any component can subscribe to.
 */

import { mockBackend } from './backends/mock';
import { webllmBackend } from './backends/webllm';
import { wllamaBackend } from './backends/wllama';
import { GERMAN_TUTOR_SYSTEM_PROMPT } from './prompts';
import { schemaForPrompt } from './responseSchemas';
import {
  INFERENCE_TIERS,
  type BackendStatus,
  type InferenceBackend,
  type InferenceOptions,
  type InferenceTier,
  type LoadProgress,
  type LoadProgressListener,
} from './types';

const BACKENDS: Record<InferenceTier, InferenceBackend> = {
  webgpu: webllmBackend,
  wasm: wllamaBackend,
  mock: mockBackend,
};

/**
 * Defaults to the mock tier so a fresh page load can never blow up before the
 * app shell has read the user's saved choice out of storage.
 */
let activeTier: InferenceTier = 'mock';

const tierListeners = new Set<(tier: InferenceTier) => void>();

export function getBackend(tier: InferenceTier): InferenceBackend {
  return BACKENDS[tier];
}

export function listBackends(): InferenceBackend[] {
  return INFERENCE_TIERS.map((tier) => BACKENDS[tier]);
}

export function getActiveTier(): InferenceTier {
  return activeTier;
}

export function getActiveBackend(): InferenceBackend {
  return BACKENDS[activeTier];
}

export function setActiveTier(tier: InferenceTier): void {
  if (activeTier === tier) return;
  activeTier = tier;
  inFlightLoad = null;
  publishLoadState({
    tier,
    status: BACKENDS[tier].getStatus(),
    progress: null,
    error: null,
  });
  for (const listener of tierListeners) listener(tier);
}

export function subscribeToActiveTier(listener: (tier: InferenceTier) => void): () => void {
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

let loadState: LoadState = { tier: activeTier, status: 'unloaded', progress: null, error: null };

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
 * Resolves once the active tier can answer a `generate` call. Safe to call on
 * every generation: it is a no-op once the model is loaded.
 */
export function ensureReady(options?: EnsureReadyOptions): Promise<void> {
  const tier = activeTier;
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
          if (activeTier !== tier) return;
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

/** Frees the active tier's model and its memory. */
export async function unloadActiveBackend(): Promise<void> {
  inFlightLoad = null;
  await getActiveBackend().unload();
  publishLoadState({ tier: activeTier, status: 'unloaded', progress: null, error: null });
}

export async function generateText(prompt: string, options?: InferenceOptions): Promise<string> {
  await ensureReady();

  // Prompts declare their intent on the first line, so the schema that
  // constrains the reply can be looked up here rather than passed down through
  // every mode pipeline.
  const schema = options?.schema ?? schemaForPrompt(prompt);

  return getActiveBackend().generate(prompt, {
    systemPrompt: GERMAN_TUTOR_SYSTEM_PROMPT,
    temperature: 0.7,
    maxTokens: 640,
    ...options,
    schema,
  });
}

export * from './capabilities';
export * from './prompts';
export * from './responseSchemas';
export * from './schemas';
export * from './types';
export { ModelOutputError } from './parse';
