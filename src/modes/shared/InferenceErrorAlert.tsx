import { isModelNotWiredUpError } from '../../inference';
import { hrefFor } from '../../app/router';
import { Alert } from '../../ui';

/**
 * One error surface for every mode. It singles out the "backend is still a
 * stub" case, which is the expected failure right now, from real breakage.
 */
export function InferenceErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;

  if (isModelNotWiredUpError(error)) {
    return (
      <Alert tone="warn" title="This tier has no model behind it yet">
        {error.message}{' '}
        <a
          href={hrefFor('/settings')}
          className="underline decoration-dotted underline-offset-4"
        >
          Open settings
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
