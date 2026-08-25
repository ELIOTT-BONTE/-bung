/**
 * Inference layer contract.
 *
 * Everything above this layer (mode screens, app shell) only ever talks to
 * `generateText`. Swapping a backend in or out must never require touching a
 * caller. This module holds no React and no storage imports.
 */

/** An engine that runs the model on this device. */
export type LocalInferenceTier = 'webgpu' | 'wasm' | 'mock';

/** A free-tier API that answers over the network. */
export type HostedProviderId = 'mistral' | 'gemini' | 'groq';

export type InferenceTier = HostedProviderId | LocalInferenceTier;

export const LOCAL_TIERS: readonly LocalInferenceTier[] = ['webgpu', 'wasm', 'mock'];

/**
 * Declaration order is the order the chain tries them, so this list is the
 * single place the provider precedence is written down.
 */
export const HOSTED_TIERS: readonly HostedProviderId[] = ['mistral', 'gemini', 'groq'];

export const INFERENCE_TIERS: readonly InferenceTier[] = [...HOSTED_TIERS, ...LOCAL_TIERS];

export function isHostedTier(tier: InferenceTier): tier is HostedProviderId {
  return (HOSTED_TIERS as readonly string[]).includes(tier);
}

export function isLocalTier(tier: InferenceTier): tier is LocalInferenceTier {
  return (LOCAL_TIERS as readonly string[]).includes(tier);
}

/**
 * The slice of JSON Schema we use to constrain model output. Deliberately
 * narrow: both engines accept a JSON Schema, but small models only reliably
 * respect simple ones, and a narrow type keeps the schemas honest.
 */
export type JsonSchema =
  | { type: 'string'; description?: string; enum?: readonly string[] }
  | { type: 'boolean'; description?: string }
  | { type: 'integer'; description?: string; minimum?: number; maximum?: number }
  | { type: 'array'; description?: string; items: JsonSchema; minItems?: number; maxItems?: number }
  | {
      type: 'object';
      description?: string;
      properties: Record<string, JsonSchema>;
      required?: readonly string[];
      additionalProperties?: false;
    };

/** A named schema the backend should constrain generation to. */
export interface ResponseSchema {
  name: string;
  schema: JsonSchema;
}

export interface InferenceOptions {
  /** Steering instruction prepended to the prompt by the backend. */
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** Aborts an in-flight generation. Backends should honour it when possible. */
  signal?: AbortSignal;
  /**
   * Forces output to match this schema on backends that support constrained
   * generation. Usually left unset: `generateText` looks the schema up from
   * the prompt's intent.
   */
  schema?: ResponseSchema;
}

export type BackendStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface LoadProgress {
  /** 0..1, or null when the backend cannot report a determinate fraction. */
  fraction: number | null;
  label: string;
}

export type LoadProgressListener = (progress: LoadProgress) => void;

/** What a tier will pull down and what it needs to run once loaded. */
export interface ModelDescriptor {
  id: string;
  /** Weights transferred on first use. Null when there is no download. */
  approximateDownloadMb: number | null;
  /** GPU memory needed to run. Null for CPU-only or no model. */
  approximateVramMb: number | null;
}

export interface LoadOptions {
  onProgress?: LoadProgressListener;
  /**
   * Loads a model other than the tier's default — used for the
   * "try the smaller model" recovery after an out-of-memory failure.
   */
  modelId?: string;
}

export interface InferenceBackend {
  readonly tier: InferenceTier;
  readonly label: string;
  readonly description: string;
  /** True when generating sends the prompt over the network to an API. */
  readonly hosted: boolean;
  /** The model this tier loads unless asked for another. */
  readonly model: ModelDescriptor;
  /** Smaller model to offer when the default will not fit. Null if none. */
  readonly fallbackModel: ModelDescriptor | null;
  getStatus(): BackendStatus;
  /** The model actually loaded, which may be the fallback. Null until ready. */
  getLoadedModelId(): string | null;
  /** Whether weights are already in this browser's cache, so load is instant. */
  isCached(modelId?: string): Promise<boolean>;
  load(options?: LoadOptions): Promise<void>;
  generate(prompt: string, options?: InferenceOptions): Promise<string>;
  unload(): Promise<void>;
}

/**
 * `hosted` doubles as the discriminant of these two, so a list of one kind
 * carries a tier the caller can use without a cast — the tier picker only ever
 * hands back a local engine, and the key fields only ever a provider.
 */
export interface LocalInferenceBackend extends InferenceBackend {
  readonly tier: LocalInferenceTier;
  readonly hosted: false;
}

export interface HostedInferenceBackend extends InferenceBackend {
  readonly tier: HostedProviderId;
  readonly hosted: true;
}

export type ModelLoadFailure =
  /** The device does not have enough GPU memory for this model. */
  | 'out-of-memory'
  /** The browser or device cannot run this tier at all. */
  | 'unsupported'
  /** The weights could not be fetched. */
  | 'download'
  | 'unknown';

/**
 * A model failed to load. Carries enough structure for the UI to offer the
 * right way out — the smaller model on an out-of-memory failure, a different
 * tier when the device cannot run this one.
 */
export class ModelLoadError extends Error {
  readonly tier: InferenceTier;
  readonly modelId: string;
  readonly kind: ModelLoadFailure;
  /** A smaller model worth trying, when one exists and would help. */
  readonly fallbackModelId: string | null;

  constructor(init: {
    tier: InferenceTier;
    modelId: string;
    kind: ModelLoadFailure;
    message: string;
    fallbackModelId?: string | null;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = 'ModelLoadError';
    this.tier = init.tier;
    this.modelId = init.modelId;
    this.kind = init.kind;
    this.fallbackModelId = init.fallbackModelId ?? null;
  }
}

export function isModelLoadError(error: unknown): error is ModelLoadError {
  return error instanceof ModelLoadError;
}

/**
 * A hosted provider refused or could not answer.
 *
 * The chain moves to the next candidate on any of these. `retryable` is the
 * narrower question of whether *this* provider might work later — true for a
 * rate limit or an outage, false for a rejected key or a rejected request,
 * which need a human to fix. That distinction is what lets the UI say "you are
 * over the free limit" rather than "something went wrong".
 *
 * A missing key is not represented here at all: a provider with no key is
 * skipped before any request is made.
 */
export class HostedProviderError extends Error {
  readonly provider: HostedProviderId;
  /** HTTP status, or null for a network, CORS or timeout failure. */
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(init: {
    provider: HostedProviderId;
    status: number | null;
    retryable: boolean;
    message: string;
    cause?: unknown;
  }) {
    super(init.message, { cause: init.cause });
    this.name = 'HostedProviderError';
    this.provider = init.provider;
    this.status = init.status;
    this.retryable = init.retryable;
  }
}

export function isHostedProviderError(error: unknown): error is HostedProviderError {
  return error instanceof HostedProviderError;
}

/** True for an abort the user (or a unmounting screen) asked for. */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : error instanceof Error && (error.name === 'AbortError' || error.name === 'WllamaAbortError')
  );
}
