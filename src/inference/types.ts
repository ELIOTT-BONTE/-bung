/**
 * Inference layer contract.
 *
 * Everything above this layer (mode screens, app shell) only ever talks to
 * `generateText`. Swapping a backend in or out must never require touching a
 * caller. This module holds no React and no storage imports.
 */

export type InferenceTier = 'webgpu' | 'wasm' | 'mock';

export const INFERENCE_TIERS: readonly InferenceTier[] = ['webgpu', 'wasm', 'mock'];

export interface InferenceOptions {
  /** Steering instruction prepended to the prompt by the backend. */
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** Aborts an in-flight generation. Backends should honour it when possible. */
  signal?: AbortSignal;
}

export type BackendStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface LoadProgress {
  /** 0..1, or null when the backend cannot report a determinate fraction. */
  fraction: number | null;
  label: string;
}

export type LoadProgressListener = (progress: LoadProgress) => void;

export interface InferenceBackend {
  readonly tier: InferenceTier;
  readonly label: string;
  readonly description: string;
  /** Human-readable identifier of the model this backend would load. */
  readonly modelId: string;
  /** Rough download size, shown in the tier picker. Null for no download. */
  readonly approximateDownloadMb: number | null;
  getStatus(): BackendStatus;
  load(onProgress?: LoadProgressListener): Promise<void>;
  generate(prompt: string, options?: InferenceOptions): Promise<string>;
  unload(): Promise<void>;
}

/**
 * Thrown by the real backends until model loading is wired up. Callers can
 * detect this specific case and show a "pick the mock tier" hint instead of a
 * generic failure.
 */
export class ModelNotWiredUpError extends Error {
  readonly tier: InferenceTier;

  constructor(tier: InferenceTier, modelId: string) {
    super(
      `Model not yet wired up: the ${tier} backend (${modelId}) is a stub. ` +
        'Switch to the Mock (dev) tier in Settings to walk through the app with canned responses.',
    );
    this.name = 'ModelNotWiredUpError';
    this.tier = tier;
  }
}

export function isModelNotWiredUpError(error: unknown): error is ModelNotWiredUpError {
  return error instanceof ModelNotWiredUpError;
}
