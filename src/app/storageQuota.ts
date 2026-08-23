/**
 * Disk space for model weights.
 *
 * A tier can want five gigabytes of cache, which raises two problems the
 * browser will not solve on its own: there may not be room, and what fits can
 * still be evicted under pressure. Both are worth knowing about before a long
 * download rather than after it.
 */

export interface QuotaReport {
  /** Bytes still available to this origin, or null when unknown. */
  availableBytes: number | null;
  /** True when the origin's storage is exempt from eviction. */
  persisted: boolean;
}

export async function readQuota(): Promise<QuotaReport> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { availableBytes: null, persisted: false };
  }

  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate?.().catch(() => null) ?? null,
    navigator.storage.persisted?.().catch(() => false) ?? false,
  ]);

  const quota = estimate?.quota;
  const usage = estimate?.usage;

  return {
    availableBytes: quota === undefined ? null : Math.max(0, quota - (usage ?? 0)),
    persisted: persisted ?? false,
  };
}

/**
 * Asks the browser to exempt this origin from eviction. Chromium grants it
 * silently for installed or frequently visited sites and denies it otherwise;
 * either way the download can go ahead, so the result is advisory.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} kB`;
}

/**
 * Headroom over the download itself, for the tokenizer, configs and the
 * browser's own overhead. A download that dies at 95% wasted the whole wait.
 */
const HEADROOM = 1.15;

export function hasRoomFor(downloadMb: number | null, quota: QuotaReport): boolean | null {
  if (downloadMb === null) return true;
  if (quota.availableBytes === null) return null;
  return quota.availableBytes >= downloadMb * 1e6 * HEADROOM;
}
