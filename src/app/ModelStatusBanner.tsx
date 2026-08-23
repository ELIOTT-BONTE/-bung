import { getBackend, isModelLoadError } from '../inference';
import { ProgressBar, cn } from '../ui';
import { hrefFor } from './router';
import { useModelStatus } from './useModelStatus';

/**
 * A gigabyte-scale download cannot live behind a spinner on one screen, so it
 * gets a strip under the header that follows the user around the app.
 */
export function ModelStatusBanner({ className }: { className?: string }) {
  const status = useModelStatus();
  const backend = getBackend(status.tier);

  // Nothing to say about a model that is loaded, or one that was never asked
  // for. The mock tier never says anything: it has nothing to download.
  if (status.tier === 'mock') return null;

  if (status.status === 'loading') {
    return (
      <div
        className={cn('border-ink-800/60 bg-ink-950/80 border-t px-5 py-2.5 backdrop-blur-md', className)}
      >
        <div className="mx-auto max-w-5xl">
          <ProgressBar
            fraction={status.progress?.fraction ?? null}
            label={`${backend.label} — ${status.progress?.label ?? 'Preparing'}`}
          />
          <p className="text-ink-600 mt-1.5 text-xs">
            Keep this tab open. The model is cached afterwards, so this is a one-time wait.
          </p>
        </div>
      </div>
    );
  }

  if (status.status === 'error' && status.error) {
    return (
      <div className={cn('border-clay-500/30 bg-clay-500/8 border-t px-5 py-2.5', className)}>
        <div className="text-clay-200 mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium">{backend.label} could not start.</span>
          <span className="text-clay-300/90">{status.error.message}</span>
          {isModelLoadError(status.error) && status.error.fallbackModelId && (
            <a
              href={hrefFor('/settings')}
              className="underline decoration-dotted underline-offset-4"
            >
              Try the smaller model
            </a>
          )}
        </div>
      </div>
    );
  }

  return null;
}
