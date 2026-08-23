/**
 * WASM tier — wllama (llama.cpp compiled to WebAssembly).
 *
 * The universal fallback: no WebGPU, no GPU memory, works in every modern
 * browser. wllama runs inference in its own worker already, so there is no
 * worker plumbing here — only the model choice and the request mapping.
 *
 * The SDK is behind a dynamic import; the `.wasm` is not, because a URL import
 * compiles to a string and pulls in no code.
 */

import wllamaWasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';
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

/**
 * Imported through the built `esm` entry rather than the bare package name.
 * The package's `main` points at an `index.js` that is not shipped, so a bare
 * import resolves to its TypeScript sources instead of the declarations.
 */
type WllamaSdk = typeof import('@wllama/wllama/esm/index.js');
type WllamaInstance = InstanceType<WllamaSdk['Wllama']>;

/**
 * Qwen2.5 1.5B punches well above its size on German and is small enough to
 * stay usable on a CPU. Verified against the repo: 940 MB, Q4_K_M.
 */
const WLLAMA_HF_REPO = 'bartowski/Qwen2.5-1.5B-Instruct-GGUF';
const WLLAMA_HF_FILE = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf';

/**
 * Built here rather than resolved through `loadModelFromHF`, which lists the
 * repo over the network first — that would make a *cached* model fail to load
 * with no connection, in an app whose whole point is running locally.
 */
const WLLAMA_MODEL_URL = `https://huggingface.co/${WLLAMA_HF_REPO}/resolve/main/${WLLAMA_HF_FILE}`;

export const WLLAMA_MODEL: ModelDescriptor = {
  id: WLLAMA_HF_FILE,
  approximateDownloadMb: 940,
  approximateVramMb: null,
};

/**
 * The prompts here carry a passage plus the learner's known words. wllama
 * defaults to a 1024-token context, which would silently truncate them — a bug
 * that reads as a stupid model rather than a bad config.
 */
const CONTEXT_TOKENS = 4096;

let sdkPromise: Promise<WllamaSdk> | null = null;

function loadSdk(): Promise<WllamaSdk> {
  sdkPromise ??= import('@wllama/wllama/esm/index.js');
  return sdkPromise;
}

function classifyLoadFailure(error: unknown): ModelLoadFailure {
  const type = (error as { type?: string } | null)?.type;
  if (type === 'download_error') return 'download';

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (/memory|allocation|allocate/.test(message)) return 'out-of-memory';
  if (/failed to fetch|network|404/.test(message)) return 'download';
  if (/webassembly|wasm|not supported|unsupported/.test(message)) return 'unsupported';
  return 'unknown';
}

function describeLoadFailure(kind: ModelLoadFailure): string {
  switch (kind) {
    case 'download':
      return `The model (${WLLAMA_MODEL.approximateDownloadMb} MB) could not be downloaded. Check your connection and try again.`;
    case 'out-of-memory':
      return 'This device ran out of memory loading the model. Closing other tabs usually helps.';
    case 'unsupported':
      return 'This browser cannot run the WebAssembly build. The Mock tier works everywhere.';
    default:
      return 'The model failed to load.';
  }
}

class WllamaBackend implements InferenceBackend {
  readonly tier = 'wasm' as const;
  readonly label = 'WASM (wllama)';
  readonly description =
    'Runs Qwen2.5 1.5B on the CPU through llama.cpp compiled to WebAssembly. Works in every modern browser; slower than WebGPU and a smaller model.';
  readonly model = WLLAMA_MODEL;
  readonly fallbackModel = null;

  private status: BackendStatus = 'unloaded';
  private instance: WllamaInstance | null = null;

  getStatus(): BackendStatus {
    return this.status;
  }

  getLoadedModelId(): string | null {
    return this.status === 'ready' ? this.model.id : null;
  }

  async isCached(): Promise<boolean> {
    try {
      const { ModelManager } = await loadSdk();
      const cached = await new ModelManager().getModels();
      return cached.some((model) => model.url === WLLAMA_MODEL_URL);
    } catch {
      // A cache probe is a nicety. Never let it break the screen it is on.
      return false;
    }
  }

  async load(options?: LoadOptions): Promise<void> {
    if (this.status === 'ready' && this.instance) return;

    this.status = 'loading';
    options?.onProgress?.({ fraction: null, label: 'Starting the WebAssembly runtime' });

    try {
      const { Wllama } = await loadSdk();

      const instance = new Wllama(
        { default: wllamaWasmUrl },
        // Once the weights are cached, loading must not need the network.
        { allowOffline: true },
      );
      this.instance = instance;

      await instance.loadModelFromUrl(WLLAMA_MODEL_URL, {
        n_ctx: CONTEXT_TOKENS,
        progressCallback: ({ loaded, total }) =>
          options?.onProgress?.({
            fraction: total > 0 ? loaded / total : null,
            label:
              total > 0
                ? `Downloading model — ${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB`
                : 'Downloading model',
          }),
      });

      options?.onProgress?.({ fraction: 1, label: 'Model ready' });
      this.status = 'ready';
    } catch (error) {
      await this.unload();
      this.status = 'error';

      const kind = classifyLoadFailure(error);
      throw new ModelLoadError({
        tier: this.tier,
        modelId: this.model.id,
        kind,
        message: describeLoadFailure(kind),
        cause: error,
      });
    }
  }

  async generate(prompt: string, options?: InferenceOptions): Promise<string> {
    if (this.status !== 'ready' || !this.instance) await this.load();
    const instance = this.instance;
    if (!instance) throw new Error('wllama is not available');

    const reply = await instance.createChatCompletion({
      messages: options?.systemPrompt
        ? [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: prompt },
          ]
        : [{ role: 'user', content: prompt }],
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      abortSignal: options?.signal,
      // llama.cpp compiles the JSON Schema to a grammar itself, so the same
      // schema object serves both tiers.
      response_format: options?.schema
        ? {
            type: 'json_schema',
            json_schema: { name: options.schema.name, schema: options.schema.schema, strict: true },
          }
        : undefined,
    });

    return cleanText(reply.choices[0]?.message?.content ?? '');
  }

  async unload(): Promise<void> {
    try {
      await this.instance?.exit();
    } catch {
      // Exiting a runtime that never finished starting can throw; it is going
      // away regardless.
    }
    this.instance = null;
    this.status = 'unloaded';
  }
}

export const wllamaBackend: InferenceBackend = new WllamaBackend();
