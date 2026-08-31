import { useState } from 'react';
import { diffStats, hasChanges } from '../../diff';
import { formatVocabDisplay, listJournalEntries, type JournalEntry } from '../../storage';
import {
  Alert,
  Badge,
  Button,
  Card,
  DiffLegend,
  DiffText,
  EmptyState,
  SectionHeading,
  Spinner,
  StatTile,
  TextArea,
} from '../../ui';
import { useAsync } from '../../app/useAsync';
import { InferenceErrorAlert } from '../shared/InferenceErrorAlert';
import { VocabPill } from '../shared/VocabPill';
import { addLookupToVocab } from '../shared/wordLookup';
import {
  STAGE_LABELS,
  submitJournalEntry,
  summarizeCorrection,
  type JournalReview,
  type JournalUsage,
  type ProgressStage,
} from './pipeline';

const PROMPT_IDEAS: readonly string[] = [
  'Was hast du heute gemacht?',
  'Woran denkst du gerade?',
  'Beschreibe deinen Weg zur Arbeit.',
];

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function HistoryItem({ entry }: { entry: JournalEntry }) {
  const [open, setOpen] = useState(false);
  // A draft never reached an engine, so neither "corrected" nor "clean" is true
  // of it. Calling it clean would claim the German was checked and passed.
  const badge =
    entry.status === 'draft'
      ? { tone: 'warn' as const, text: 'not checked' }
      : entry.correctedText !== null
        ? { tone: 'warn' as const, text: 'corrected' }
        : { tone: 'success' as const, text: 'clean' };

  return (
    <div className="border-ink-800/70 border-t py-4 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-ink-300 font-reading truncate text-sm">{entry.originalText}</p>
          <p className="text-ink-600 mt-1 text-xs">
            {formatDate(entry.createdAt)} · {entry.vocabIds.length} word
            {entry.vocabIds.length === 1 ? '' : 's'} tracked
            {entry.correctionEngine ? ` · checked by ${entry.correctionEngine}` : ''}
          </p>
        </div>
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </button>

      {open && entry.diff.length > 0 && (
        <div className="mt-3">
          <DiffText segments={entry.diff} className="text-[1rem]" />
        </div>
      )}
    </div>
  );
}

export function JournalingMode() {
  const [text, setText] = useState('');
  const [stage, setStage] = useState<ProgressStage | null>(null);
  const [review, setReview] = useState<JournalReview | null>(null);
  const [addingTerm, setAddingTerm] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const history = useAsync(() => listJournalEntries(10), []);

  const busy = stage !== null;
  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

  async function submit() {
    setError(null);
    setReview(null);

    try {
      const result = await submitJournalEntry(text, { onStage: setStage });
      setReview(result);
      history.reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setStage(null);
    }
  }

  /**
   * Stores one suggested word, and only that. It is deliberately not graded for
   * this entry: the entry was already judged against the list as it stood, and
   * back-dating a grade onto a word the learner had not chosen yet would be the
   * same silent bookkeeping this flow exists to avoid. It counts from the next
   * entry on.
   */
  async function addWord(item: JournalUsage) {
    setAddingTerm(item.draft.term);
    setError(null);
    try {
      const entry = await addLookupToVocab(item.draft);
      setReview((current) =>
        current
          ? {
              ...current,
              usage: current.usage.map((row) =>
                row.draft.term === item.draft.term ? { ...row, entry } : row,
              ),
            }
          : current,
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setAddingTerm(null);
    }
  }

  function startNew() {
    setText('');
    setReview(null);
    setError(null);
  }

  const changed = review ? hasChanges(review.diff) : false;
  const stats = review ? diffStats(review.diff) : null;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Write"
        title="Journaling"
        description="Write whatever you want in German. Your entry is saved first, then checked — and if something needs fixing you get the corrected version with every change highlighted."
        actions={
          review ? (
            <Button variant="ghost" onClick={startNew}>
              New entry
            </Button>
          ) : undefined
        }
      />

      <InferenceErrorAlert error={error} />

      {!review && (
        <Card className="flex flex-col gap-5">
          <TextArea
            label="Today's entry"
            reading
            rows={9}
            placeholder={PROMPT_IDEAS[0]}
            value={text}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            hint={
              <>
                Ideas: {PROMPT_IDEAS.join(' · ')}
                {wordCount > 0 ? ` — ${wordCount} word${wordCount === 1 ? '' : 's'} so far` : ''}
              </>
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={submit} disabled={busy || wordCount < 3}>
              {busy ? 'Working…' : 'Save and check'}
            </Button>
            {busy && stage && (
              <span className="text-ink-400 flex items-center gap-2 text-sm">
                <Spinner /> {STAGE_LABELS[stage]}
              </span>
            )}
          </div>
        </Card>
      )}

      {review && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Words written" value={stats ? stats.unchangedWords + stats.deletedWords : 0} />
            <StatTile label="Words changed" value={stats?.deletedWords ?? 0} />
            <StatTile
              label="Mastery events"
              value={review.masteryResults.length}
              tone="accent"
              hint="words already on your list"
            />
            <StatTile
              label="Used correctly"
              value={review.usage.filter((item) => item.usedCorrectly).length}
              hint={`of ${review.usage.length} found`}
            />
          </div>

          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-ink-100 font-medium">
                {changed ? 'Your entry, with corrections' : 'Your entry'}
              </h3>
              <Badge tone={changed ? 'warn' : 'success'}>
                {changed ? 'corrections applied' : 'nothing to correct'}
              </Badge>
            </div>

            <p className="text-ink-400 text-sm leading-relaxed">{summarizeCorrection(review)}</p>
            <p className="text-ink-600 text-xs">Checked by {review.correctionEngine}</p>

            <DiffText segments={review.diff} />
            {changed && <DiffLegend />}

            {changed && review.correctedText && (
              <details className="border-ink-800/70 border-t pt-3">
                <summary className="text-ink-500 hover:text-ink-300 cursor-pointer text-sm">
                  Show the corrected version on its own
                </summary>
                <p className="font-reading text-ink-200 mt-3 text-[1.05rem] leading-[1.8] whitespace-pre-wrap">
                  {review.correctedText}
                </p>
              </details>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <div>
              <h3 className="text-ink-100 font-medium">Words you produced</h3>
              <p className="text-ink-500 mt-1 text-sm leading-relaxed">
                Writing a word yourself is production, so the ones already in your vocabulary
                logged a mastery event — or a failed attempt, if the correction had to fix them,
                which brings them back sooner. The rest are only suggestions: nothing joins your
                vocabulary until you add it.
              </p>
            </div>

            {review.usage.length === 0 ? (
              <p className="text-ink-500 text-sm">No trackable vocabulary was found in this entry.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {review.usage.map((item) => (
                  <div key={item.draft.term} className="flex flex-wrap items-center gap-2">
                    {item.entry ? (
                      <>
                        <VocabPill entry={item.entry} highlighted={item.usedCorrectly} />
                        <Badge tone={item.usedCorrectly ? 'success' : 'warn'}>
                          {item.usedCorrectly ? 'used correctly' : 'corrected'}
                        </Badge>
                        <span className="text-ink-600 text-xs">
                          mastery {item.entry.masteryLevel}/5
                          {item.note ? ` · ${item.note}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="border-ink-800 text-ink-400 inline-flex items-baseline gap-1.5 rounded-lg border border-dashed px-2.5 py-1 text-sm">
                          <span className="font-reading">{formatVocabDisplay(item.draft)}</span>
                          {item.draft.definition && (
                            <span className="text-ink-600 text-xs">{item.draft.definition}</span>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          onClick={() => addWord(item)}
                          disabled={addingTerm !== null}
                        >
                          {addingTerm === item.draft.term ? 'Adding…' : 'Add to vocabulary'}
                        </Button>
                        <span className="text-ink-600 text-xs">
                          not tracked, so nothing was recorded
                          {item.note ? ` · ${item.note}` : ''}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {review.rejected.length > 0 && (
              <Alert tone="warn" title="Not saved">
                {review.rejected.map((item) => `${item.term} (${item.reason})`).join('; ')}
              </Alert>
            )}
          </Card>
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <h3 className="text-ink-100 font-medium">Earlier entries</h3>
        {history.loading && <Spinner />}
        {!history.loading && (history.data?.length ?? 0) === 0 && (
          <EmptyState
            title="Nothing here yet"
            description="Your entries stay on this device. Write one above and it will show up here with its corrections."
          />
        )}
        <div>
          {history.data?.map((entry) => <HistoryItem key={entry.id} entry={entry} />)}
        </div>
      </Card>
    </div>
  );
}
