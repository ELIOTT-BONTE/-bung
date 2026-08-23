import { useState } from 'react';
import {
  getBackend,
  isModelNotWiredUpError,
  listBackends,
  type CapabilityReport,
  type InferenceTier,
  type LoadProgress,
} from '../inference';
import { Alert, Badge, Button, ProgressBar, Spinner, cn } from '../ui';

export interface TierPickerProps {
  selected: InferenceTier;
  onSelect: (tier: InferenceTier) => void;
  report: CapabilityReport | null;
  className?: string;
}

export function TierPicker({ selected, onSelect, report, className }: TierPickerProps) {
  return (
    <div className={cn('grid gap-3', className)}>
      {listBackends().map((backend) => {
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
              {backend.approximateDownloadMb !== null && (
                <Badge tone="neutral">~{backend.approximateDownloadMb} MB download</Badge>
              )}
            </div>
            <p className="text-ink-400 mt-2 text-sm leading-relaxed">{backend.description}</p>
            <p className="text-ink-600 mt-1.5 font-mono text-xs">
              {backend.modelId}
              {availability ? ` · ${availability.reason}` : ''}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export interface ModelPreparationProps {
  tier: InferenceTier;
  className?: string;
}

/**
 * Placeholder for the real download flow. It calls the selected backend's
 * `load`, which is exactly the call that will report genuine progress once the
 * models are wired up; today the two real tiers report that they are stubs.
 */
export function ModelPreparation({ tier, className }: ModelPreparationProps) {
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'warn' | 'danger'; text: string } | null>(
    null,
  );

  const backend = getBackend(tier);

  async function prepare() {
    setRunning(true);
    setMessage(null);
    setProgress({ fraction: 0, label: 'Starting' });

    try {
      await backend.load((update) => setProgress(update));
      setMessage({ tone: 'success', text: `${backend.label} is ready.` });
    } catch (error) {
      setMessage({
        tone: isModelNotWiredUpError(error) ? 'warn' : 'danger',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={prepare} disabled={running} variant="secondary" size="sm">
          {running ? <Spinner className="size-3" /> : null}
          {running ? 'Preparing…' : 'Prepare model'}
        </Button>
        <span className="text-ink-500 text-xs">
          Downloads happen in your browser and are cached for next time.
        </span>
      </div>

      {progress && <ProgressBar fraction={progress.fraction} label={progress.label} />}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
