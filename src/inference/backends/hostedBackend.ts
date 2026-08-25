/**
 * Shared shape of a hosted provider backend.
 *
 * The three providers differ only in their wire format, so everything else —
 * status, the key check, cleaning the reply — lives here once. Each provider
 * file is then just its own facts.
 */

import { cleanText } from '../parse';
import { resolveApiKey } from '../keys';
import {
  HostedProviderError,
  ModelLoadError,
  type BackendStatus,
  type HostedInferenceBackend,
  type HostedProviderId,
  type InferenceOptions,
} from '../types';
import { postJson } from './hostedFetch';
import type { HostedRequest } from './hostedRequests';

export interface HostedBackendConfig {
  provider: HostedProviderId;
  label: string;
  description: string;
  modelId: string;
  buildRequest(apiKey: string, prompt: string, options?: InferenceOptions): HostedRequest;
  readReply(payload: unknown): string;
}

class HostedBackend implements HostedInferenceBackend {
  readonly hosted = true;
  readonly tier: HostedProviderId;
  readonly label: string;
  readonly description: string;
  readonly model: { id: string; approximateDownloadMb: null; approximateVramMb: null };
  /** Nothing to fall back to: a different provider is the chain's job. */
  readonly fallbackModel = null;

  private readonly config: HostedBackendConfig;
  private status: BackendStatus = 'unloaded';

  constructor(config: HostedBackendConfig) {
    this.config = config;
    this.tier = config.provider;
    this.label = config.label;
    this.description = config.description;
    this.model = { id: config.modelId, approximateDownloadMb: null, approximateVramMb: null };
  }

  getStatus(): BackendStatus {
    return this.status;
  }

  getLoadedModelId(): string | null {
    return this.status === 'ready' ? this.model.id : null;
  }

  /** No weights, so there is never anything to wait for on a second run. */
  async isCached(): Promise<boolean> {
    return true;
  }

  /**
   * There is nothing to download; "loading" a hosted provider only means
   * confirming it has a key, so the settings screen can report it as usable.
   */
  async load(): Promise<void> {
    if (!resolveApiKey(this.config.provider)) {
      this.status = 'error';
      throw new ModelLoadError({
        tier: this.config.provider,
        modelId: this.model.id,
        kind: 'unsupported',
        message: `No ${this.label} API key is configured. Add one in Settings, or leave it blank to skip this provider.`,
      });
    }
    this.status = 'ready';
  }

  async generate(prompt: string, options?: InferenceOptions): Promise<string> {
    const apiKey = resolveApiKey(this.config.provider);

    // The chain skips keyless providers before it gets here, so this only
    // catches a direct call.
    if (!apiKey) {
      throw new HostedProviderError({
        provider: this.config.provider,
        status: null,
        retryable: false,
        message: `No ${this.label} API key is configured`,
      });
    }

    const payload = await postJson({
      provider: this.config.provider,
      request: this.config.buildRequest(apiKey, prompt, options),
      signal: options?.signal,
    });

    this.status = 'ready';
    return cleanText(this.config.readReply(payload));
  }

  async unload(): Promise<void> {
    this.status = 'unloaded';
  }
}

export function createHostedBackend(config: HostedBackendConfig): HostedInferenceBackend {
  return new HostedBackend(config);
}
