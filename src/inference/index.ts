/**
 * The one door into inference.
 *
 * Callers only ever use `generateText`. Which backend answers is decided here
 * by the active tier, so adding, removing or wiring up a backend never touches
 * a mode screen.
 */

import { mockBackend } from './backends/mock';
import { webllmBackend } from './backends/webllm';
import { wllamaBackend } from './backends/wllama';
import { GERMAN_TUTOR_SYSTEM_PROMPT } from './prompts';
import {
  INFERENCE_TIERS,
  type InferenceBackend,
  type InferenceOptions,
  type InferenceTier,
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
  for (const listener of tierListeners) listener(tier);
}

export function subscribeToActiveTier(listener: (tier: InferenceTier) => void): () => void {
  tierListeners.add(listener);
  return () => tierListeners.delete(listener);
}

export function loadActiveBackend(onProgress?: LoadProgressListener): Promise<void> {
  return getActiveBackend().load(onProgress);
}

export async function generateText(prompt: string, options?: InferenceOptions): Promise<string> {
  const backend = getActiveBackend();
  return backend.generate(prompt, {
    systemPrompt: GERMAN_TUTOR_SYSTEM_PROMPT,
    temperature: 0.7,
    maxTokens: 640,
    ...options,
  });
}

export * from './capabilities';
export * from './prompts';
export * from './schemas';
export * from './types';
export { ModelOutputError } from './parse';
