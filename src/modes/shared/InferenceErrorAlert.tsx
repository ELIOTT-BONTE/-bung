import { isModelLoadError } from '../../inference';
import { hrefFor } from '../../app/router';
import { Alert } from '../../ui';

/**
 * One error surface for every mode. A model that would not load is the failure
 * users actually hit, and it always has a way out — a smaller model, another
 * tier — so it gets its own treatment rather than a generic red box.
 */
export function InferenceErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;

  if (isModelLoadError(error)) {
    return (
      <Alert tone="warn" title="The model could not be loaded">
        {error.message}{' '}
        <a href={hrefFor('/settings')} className="underline decoration-dotted underline-offset-4">
          {error.fallbackModelId ? 'Try the smaller model in settings' : 'Change tier in settings'}
        </a>
        .
      </Alert>
    );
  }

  return (
    <Alert tone="danger" title="Something went wrong">
      {error instanceof Error ? error.message : String(error)}
    </Alert>
  );
}
