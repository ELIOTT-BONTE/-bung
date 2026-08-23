/**
 * WebGPU tier — WebLLM (MLC).
 *
 * Stub: the interface, tier metadata and status machine are final, model
 * loading is not. Wiring it up is additive, not a refactor.
 */

import {
  ModelNotWiredUpError,
  type BackendStatus,
  type InferenceBackend,
  type InferenceOptions,
  type LoadProgressListener,
} from '../types';

/**
 * Target model for this tier. Kept here (not in UI code) so swapping models
 * is a one-line change in the backend that owns it.
 */
export const WEBLLM_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

class WebLlmBackend implements InferenceBackend {
  readonly tier = 'webgpu' as const;
  readonly label = 'WebGPU (WebLLM)';
  readonly description =
    'Runs a quantised chat model on your GPU through WebLLM. Fastest tier; needs a WebGPU-capable browser.';
  readonly modelId = WEBLLM_MODEL_ID;
  readonly approximateDownloadMb = 1800;

  private status: BackendStatus = 'unloaded';

  getStatus(): BackendStatus {
    return this.status;
  }

  async load(onProgress?: LoadProgressListener): Promise<void> {
    this.status = 'loading';
    onProgress?.({ fraction: null, label: 'Model loading is not wired up yet' });

    // FOLLOW-UP: replace the throw below with the real engine creation:
    //   const webllm = await import('@mlc-ai/web-llm');
    //   this.engine = await webllm.CreateMLCEngine(WEBLLM_MODEL_ID, {
    //     initProgressCallback: (report) =>
    //       onProgress?.({ fraction: report.progress, label: report.text }),
    //   });
    //   this.status = 'ready';
    this.status = 'error';
    throw new ModelNotWiredUpError(this.tier, this.modelId);
  }

  async generate(_prompt: string, _options?: InferenceOptions): Promise<string> {
    // FOLLOW-UP: this.engine.chat.completions.create({ messages, temperature, max_tokens })
    // and return the first choice's message content as plain text.
    throw new ModelNotWiredUpError(this.tier, this.modelId);
  }

  async unload(): Promise<void> {
    this.status = 'unloaded';
  }
}

export const webllmBackend: InferenceBackend = new WebLlmBackend();
