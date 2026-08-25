import { hasApiKey } from './keys';
import { HOSTED_TIERS, type InferenceTier, type LocalInferenceTier } from './types';

export interface TierAvailability {
  tier: InferenceTier;
  available: boolean;
  /** Short explanation shown next to the tier in the picker. */
  reason: string;
}

export type CapabilityReport = Record<InferenceTier, TierAvailability>;

/**
 * WebGPU presence alone is not enough — a browser can expose `navigator.gpu`
 * and still fail to hand out an adapter (headless, blocklisted driver, no
 * hardware). Both checks run here so the UI can only offer a tier that will
 * actually start.
 */
export async function detectWebGpu(): Promise<TierAvailability> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return {
      tier: 'webgpu',
      available: false,
      reason: 'navigator.gpu is unavailable in this browser',
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        tier: 'webgpu',
        available: false,
        reason: 'No WebGPU adapter was granted by this device',
      };
    }
    return { tier: 'webgpu', available: true, reason: 'WebGPU adapter available' };
  } catch (error) {
    return {
      tier: 'webgpu',
      available: false,
      reason: `WebGPU adapter request failed: ${(error as Error).message}`,
    };
  }
}

export function detectWasm(): TierAvailability {
  const available = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  return {
    tier: 'wasm',
    available,
    reason: available
      ? 'WebAssembly available — works everywhere, slower than WebGPU'
      : 'WebAssembly is unavailable in this browser',
  };
}

/**
 * A hosted provider needs no hardware, only a key. There is no way to tell
 * whether the key is *valid* without spending a request, so "available" here
 * means "worth attempting" — the chain finds out the rest.
 */
export function detectHosted(): Record<string, TierAvailability> {
  const report: Record<string, TierAvailability> = {};
  for (const provider of HOSTED_TIERS) {
    report[provider] = hasApiKey(provider)
      ? { tier: provider, available: true, reason: 'API key configured' }
      : { tier: provider, available: false, reason: 'No API key — this provider will be skipped' };
  }
  return report;
}

export async function detectCapabilities(): Promise<CapabilityReport> {
  const webgpu = await detectWebGpu();
  return {
    ...detectHosted(),
    webgpu,
    wasm: detectWasm(),
    mock: {
      tier: 'mock',
      available: true,
      reason: 'Canned offline responses — no download, for trying out the app',
    },
  } as CapabilityReport;
}

/**
 * Best *local* engine the current device can run, most capable first. Hosted
 * providers are never returned: this picks the last link in the chain, not the
 * first.
 */
export function preferredTier(report: CapabilityReport): LocalInferenceTier {
  if (report.webgpu.available) return 'webgpu';
  if (report.wasm.available) return 'wasm';
  return 'mock';
}
