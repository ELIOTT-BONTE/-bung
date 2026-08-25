import { useEffect, useState } from 'react';
import {
  ensureReady,
  getBackend,
  isModelLoadError,
  listLocalBackends,
  type CapabilityReport,
  type LocalInferenceTier,
} from '../inference';
import { Alert, Badge, Button, ProgressBar, Spinner, cn } from '../ui';
import { formatBytes, hasRoomFor, readQuota, requestPersistence, type QuotaReport } from './storageQuota';
import { useModelStatus } from './useModelStatus';

function formatSize(megabytes: number): string {
  return megabytes >= 1000 ? `${(megabytes / 1000).toFixed(1)} GB` : `${megabytes} MB`;
}

export interface TierPickerProps {
  selected: LocalInferenceTier;
  onSelect: (tier: LocalInferenceTier) => void;
  report: CapabilityReport | null;
  className?: string;
}

/**
 * Picks the *local* engine — the last candidate in the chain, used when no
 * hosted provider can answer. Hosted providers are deliberately absent: they
 * are not an alternative to this choice, they run before it.
 */
export function TierPicker({ selected, onSelect, report, className }: TierPickerProps) {
  return (
    <div
      className={cn('grid gap-3', className)}
      role="radiogroup"
      aria-label="Local inference engine"
    >
      {listLocalBackends().map((backend) => {
        const availability = report?.[backend.tier];
        const available = availability?.available ?? true;
        const isSelected = selected === backend.tier;

        return (
          <button
            key={backend.tier}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={!available}
            onClick={() => onSelect(backend.tier)}
            className={cn(
              'rounded-card border px-4 py-4 text-left transition-colors duration-150',
              isSelected
                ? 'border-ember-500/60 bg-ember-500/8'
                : 'border-ink-800 bg-ink-900/40 hover:border-ink-700',
              !available && 'cursor-not-allowed opacity-45 hover:border-ink-800',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-100 font-medium">{backend.label}</span>
              {report === null ? (
                <Badge tone="neutral">
                  <Spinner className="size-3" /> checking
                </Badge>
              ) : available ? (
                <Badge tone={backend.tier === 'mock' ? 'accent' : 'success'}>available</Badge>
              ) : (
                <Badge tone="danger">unavailable</Badge>
              )}
              {backend.model.approximateDownloadMb !== null && (
                <Badge tone="neutral">
                  {formatSize(backend.model.approximateDownloadMb)} download
                </Badge>
              )}
              {backend.model.approximateVramMb !== null && (
                <Badge tone="neutral">
                  needs ~{formatSize(backend.model.approximateVramMb)} GPU memory
                </Badge>
              )}
            </div>
            <p className="text-ink-400 mt-2 text-sm leading-relaxed">{backend.description}</p>
            <p className="text-ink-600 mt-1.5 font-mono text-xs">
              {backend.model.id}
              {availability ? ` · ${availability.reason}` : ''}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export interface ModelPreparationProps {
  tier: LocalInferenceTier;
  className?: string;
}

/**
 * Downloads and loads a local tier's model.
 *
 * The load goes through `ensureReady`, so progress shows up here and in the
 * app-wide banner at once and navigating away does not orphan the download.
 * That also means `tier` must be the *active* tier — both callers select a tier
 * by saving it, so it always is.
 *
 * Preparing ahead of time is now purely optional: with hosted providers in
 * front, the local model is only reached when they all decline.
 */
export function ModelPreparation({ tier, className }: ModelPreparationProps) {
  const backend = getBackend(tier);
  const status = useModelStatus();
  const [quota, setQuota] = useState<QuotaReport | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  const downloadMb = backend.model.approximateDownloadMb;
  const isActiveTier = status.tier === tier;
  const running = isActiveTier && status.status === 'loading';
  const ready = isActiveTier && status.status === 'ready';

  useEffect(() => {
    let cancelled = false;
    setCached(null);
    setFailure(null);

    if (downloadMb === null) return;

    void readQuota().then((result) => {
      if (!cancelled) setQuota(result);
    });
    // Only probed for the tier on screen: the probe imports that engine's SDK,
    // and there is no reason to pull down both.
    void backend.isCached().then((result) => {
      if (!cancelled) setCached(result);
    });

    return () => {
      cancelled = true;
    };
  }, [backend, downloadMb]);

  async function prepare(modelId?: string) {
    setFailure(null);
    // A cache that the browser may evict is a wasted multi-gigabyte download.
    if (downloadMb !== null && !quota?.persisted) await requestPersistence();

    try {
      await ensureReady({ modelId });
      setCached(true);
    } catch (error) {
      setFailure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  const room = hasRoomFor(downloadMb, quota ?? { availableBytes: null, persisted: false });
  const error = failure ?? (isActiveTier && status.status === 'error' ? status.error : null);
  const fallbackModelId = isModelLoadError(error) ? error.fallbackModelId : null;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => prepare()} disabled={running || ready} variant="secondary" size="sm">
          {running ? <Spinner className="size-3" /> : null}
          {running ? 'Preparing…' : ready ? 'Model ready' : 'Prepare model'}
        </Button>

        {cached === true && !ready && <Badge tone="success">already downloaded</Badge>}
        {cached === false && downloadMb !== null && (
          <span className="text-ink-500 text-xs">
            First use downloads {formatSize(downloadMb)} from Hugging Face, then it is cached.
          </span>
        )}
        {downloadMb === null && (
          <span className="text-ink-500 text-xs">Nothing to download for this tier.</span>
        )}
      </div>

      {room === false && quota?.availableBytes != null && downloadMb !== null && (
        <Alert tone="warn" title="This browser may not have room">
          {formatSize(downloadMb)} is needed but only {formatBytes(quota.availableBytes)} is free for
          this site. Free up disk space, or pick a tier with a smaller model.
        </Alert>
      )}

      {running && (
        <ProgressBar
          fraction={status.progress?.fraction ?? null}
          label={status.progress?.label ?? 'Preparing'}
        />
      )}

      {ready && !failure && <Alert tone="success">{backend.label} is ready to use.</Alert>}

      {error && (
        <Alert tone="danger" title="The model could not be loaded">
          {error.message}
          {fallbackModelId && (
            <span className="mt-2 block">
              <Button variant="secondary" size="sm" onClick={() => prepare(fallbackModelId)}>
                Try {fallbackModelId}
              </Button>
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
