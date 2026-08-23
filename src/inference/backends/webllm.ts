/**
 * WebGPU tier — WebLLM (MLC).
 *
 * A quantised Llama runs on the GPU inside a web worker. The SDK is behind a
 * dynamic import so a learner who picks the WASM tier never downloads it.
 *
 * This file is a thin shell around the engine: prompt mapping lives in
 * `webllmRequest.ts` so it can be tested without a GPU.
 */

import {
  ModelLoadError,
  type BackendStatus,
  type InferenceBackend,
  type InferenceOptions,
  type LoadOptions,
  type ModelDescriptor,
  type ModelLoadFailure,
} from '../types';
import { cleanText } from '../parse';
import { buildChatRequest } from './webllmRequest';

type WebLlmSdk = typeof import('@mlc-ai/web-llm');
type WebLlmEngine = Awaited<ReturnType<WebLlmSdk['CreateWebWorkerMLCEngine']>>;

/**
 * Chosen for German quality: the 8B Llama is markedly better at case,
 * gender and idiom than the small models, which is what this app is judged on.
 *
 * Figures are `vram_required_MB` from `prebuiltAppConfig` for the pinned SDK
 * version, and the on-disk weight size. Both are re-read from the SDK at load
 * time for error messages, so a version bump cannot silently make them lie.
 */
export const WEBLLM_MODEL: ModelDescriptor = {
  id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
  approximateDownloadMb: 5000,
  approximateVramMb: 6101,
};

/**
 * ~6 GB of VRAM rules out a lot of laptops, and "it failed, good luck" is not
 * an acceptable outcome, so there is always a smaller model to fall back to.
 */
export const WEBLLM_FALLBACK_MODEL: ModelDescriptor = {
  id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  approximateDownloadMb: 1800,
  approximateVramMb: 2264,
};

let sdkPromise: Promise<WebLlmSdk> | null = null;

/** Imported once and reused; the SDK is a large module. */
function loadSdk(): Promise<WebLlmSdk> {
  sdkPromise ??= import('@mlc-ai/web-llm');
  return sdkPromise;
}

/**
 * Worker errors cross `postMessage`, which strips the class identity off the
 * SDK's error types, so the message is all we have to go on. Guessing wrong is
 * cheap (a slightly off recovery hint); not guessing at all is not, because
 * the out-of-memory case is the one users actually hit.
 */
function classifyLoadFailure(error: unknown): ModelLoadFailure {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (/out of memory|oom|allocation failed|cannot allocate|device was lost|device lost/.test(message)) {
    return 'out-of-memory';
  }
  if (/buffer size|maxstoragebufferbindingsize|exceeds? (the )?limit|too large/.test(message)) {
    return 'out-of-memory';
  }
  if (/webgpu|adapter|shader-f16|requestdevice|not supported|unsupported/.test(message)) {
    return 'unsupported';
  }
  if (/failed to fetch|networkerror|network error|load failed|404|integrity/.test(message)) {
    return 'download';
  }
  return 'unknown';
}

function describeLoadFailure(kind: ModelLoadFailure, modelId: string, requiredVramMb: number | null) {
  switch (kind) {
    case 'out-of-memory':
      return (
        `${modelId} did not fit in this device's GPU memory` +
        (requiredVramMb ? ` (it needs about ${Math.round(requiredVramMb)} MB)` : '') +
        '. Try the smaller model, or switch to the WASM tier.'
      );
    case 'unsupported':
      return `This browser or GPU cannot run ${modelId} through WebGPU. The WASM tier works everywhere.`;
    case 'download':
      return `The weights for ${modelId} could not be downloaded. Check your connection and try again.`;
    default:
      return `${modelId} failed to load.`;
  }
}

class WebLlmBackend implements InferenceBackend {
  readonly tier = 'webgpu' as const;
  readonly label = 'WebGPU (WebLLM)';
  readonly description =
    'Runs a quantised Llama 3.1 8B on your GPU through WebLLM. Best German of the three tiers; needs WebGPU and a lot of GPU memory.';
  readonly model = WEBLLM_MODEL;
  readonly fallbackModel = WEBLLM_FALLBACK_MODEL;

  private status: BackendStatus = 'unloaded';
  private engine: WebLlmEngine | null = null;
  private worker: Worker | null = null;
  private loadedModelId: string | null = null;

  getStatus(): BackendStatus {
    return this.status;
  }

  getLoadedModelId(): string | null {
    return this.loadedModelId;
  }

  async isCached(modelId = this.model.id): Promise<boolean> {
    try {
      const webllm = await loadSdk();
      return await webllm.hasModelInCache(modelId);
    } catch {
      // A cache probe is a nicety. Never let it break the screen it is on.
      return false;
    }
  }

  async load(options?: LoadOptions): Promise<void> {
    const modelId = options?.modelId ?? this.model.id;

    if (this.status === 'ready' && this.loadedModelId === modelId) return;
    // Switching models means a different set of GPU buffers; start clean.
    if (this.engine) await this.unload();

    this.status = 'loading';
    options?.onProgress?.({ fraction: null, label: 'Loading WebLLM' });

    let webllm: WebLlmSdk;
    try {
      webllm = await loadSdk();
    } catch (error) {
      this.status = 'error';
      throw new ModelLoadError({
        tier: this.tier,
        modelId,
        kind: 'download',
        message: 'The WebLLM engine itself could not be loaded.',
        cause: error,
      });
    }

    const requiredVramMb =
      webllm.prebuiltAppConfig.model_list.find((record) => record.model_id === modelId)
        ?.vram_required_MB ?? null;

    try {
      const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;

      this.engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (report) =>
          options?.onProgress?.({
            // WebLLM reports 0..1 already, and its text is specific enough to
            // show verbatim ("Fetching param cache[12/33]: 1200MB fetched").
            fraction: Number.isFinite(report.progress) ? report.progress : null,
            label: report.text,
          }),
      });

      this.loadedModelId = modelId;
      this.status = 'ready';
    } catch (error) {
      await this.unload();
      this.status = 'error';

      const kind = classifyLoadFailure(error);
      throw new ModelLoadError({
        tier: this.tier,
        modelId,
        kind,
        message: describeLoadFailure(kind, modelId, requiredVramMb),
        // Only offer the smaller model when a smaller model is the answer, and
        // not when it is already what failed.
        fallbackModelId:
          kind === 'out-of-memory' && modelId !== this.fallbackModel.id
            ? this.fallbackModel.id
            : null,
        cause: error,
      });
    }
  }

  async generate(prompt: string, options?: InferenceOptions): Promise<string> {
    if (this.status !== 'ready' || !this.engine) await this.load();
    const engine = this.engine;
    if (!engine) throw new Error('WebLLM engine is not available');

    const onAbort = () => engine.interruptGenerate();
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const reply = await engine.chat.completions.create(buildChatRequest(prompt, options));
      // `interruptGenerate` makes the pending call resolve with whatever was
      // decoded so far rather than reject, so an abort has to be caught here or
      // the caller would treat a truncated answer as a real one.
      if (options?.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
      return cleanText(reply.choices[0]?.message?.content ?? '');
    } finally {
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  async unload(): Promise<void> {
    try {
      await this.engine?.unload();
    } catch {
      // Unloading a half-initialised engine can throw; the worker still goes.
    }
    this.worker?.terminate();
    this.engine = null;
    this.worker = null;
    this.loadedModelId = null;
    this.status = 'unloaded';
  }
}

export const webllmBackend: InferenceBackend = new WebLlmBackend();
