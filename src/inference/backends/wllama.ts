/**
 * WASM tier — wllama (llama.cpp compiled to WebAssembly).
 *
 * Stub: universal fallback tier, offered on every device. Model loading is a
 * follow-up; the contract here is final.
 */

import {
  ModelNotWiredUpError,
  type BackendStatus,
  type InferenceBackend,
  type InferenceOptions,
  type LoadProgressListener,
} from '../types';

/** GGUF the WASM tier will pull on first use. No weights live in this repo. */
export const WLLAMA_MODEL_ID = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf';

class WllamaBackend implements InferenceBackend {
  readonly tier = 'wasm' as const;
  readonly label = 'WASM (wllama)';
  readonly description =
    'Runs llama.cpp compiled to WebAssembly on the CPU. Works in every modern browser; slower and uses a smaller model.';
  readonly modelId = WLLAMA_MODEL_ID;
  readonly approximateDownloadMb = 1100;

  private status: BackendStatus = 'unloaded';

  getStatus(): BackendStatus {
    return this.status;
  }

  async load(onProgress?: LoadProgressListener): Promise<void> {
    this.status = 'loading';
    onProgress?.({ fraction: null, label: 'Model loading is not wired up yet' });

    // FOLLOW-UP: replace the throw below with the real loader:
    //   const { Wllama } = await import('@wllama/wllama');
    //   this.wllama = new Wllama(WLLAMA_ASSET_PATHS);
    //   await this.wllama.loadModelFromUrl(modelUrl, {
    //     progressCallback: ({ loaded, total }) =>
    //       onProgress?.({ fraction: loaded / total, label: 'Downloading model' }),
    //   });
    //   this.status = 'ready';
    this.status = 'error';
    throw new ModelNotWiredUpError(this.tier, this.modelId);
  }

  async generate(_prompt: string, _options?: InferenceOptions): Promise<string> {
    // FOLLOW-UP: this.wllama.createCompletion(formattedPrompt, { nPredict, sampling })
    // and return the completion text unchanged.
    throw new ModelNotWiredUpError(this.tier, this.modelId);
  }

  async unload(): Promise<void> {
    this.status = 'unloaded';
  }
}

export const wllamaBackend: InferenceBackend = new WllamaBackend();
