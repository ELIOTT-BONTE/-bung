import { useEffect, useRef, useState } from 'react';
import { hrefFor } from '../../app/router';
import { useSettings } from '../../app/settings';
import { useAsync } from '../../app/useAsync';
import { daysUntilDue } from '../../srs';
import { listVocab, type MasteryAttemptResult, type ReviewGrade } from '../../storage';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeading,
  Spinner,
  StatTile,
} from '../../ui';
import { InferenceErrorAlert } from '../shared/InferenceErrorAlert';
import { Flashcard } from './Flashcard';
import { SentenceExercise } from './SentenceExercise';
import { VocabTable } from './VocabTable';
import {
  buildSession,
  gradeFlashcard,
  gradeSentence,
  recordCardShown,
  tally,
  type TrainingItem,
} from './session';

interface AnswerFeedback {
  result: MasteryAttemptResult;
  /** Evaluator feedback, present for sentence production only. */
  comment: string | null;
}

export function VocabTrainingMode() {
  const { settings } = useSettings();
  const session = useAsync(() => buildSession(settings.dailyReviewTarget), [
    settings.dailyReviewTarget,
  ]);
  const allWords = useAsync(listVocab, []);

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<MasteryAttemptResult[]>([]);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const exposed = useRef(new Set<string>());

  const items: TrainingItem[] = session.data ?? [];
  const current = items[index];

  // Presenting a card is a passive encounter: one exposure, nothing else.
  useEffect(() => {
    if (!current || exposed.current.has(current.entry.id)) return;
    exposed.current.add(current.entry.id);
    void recordCardShown(current.entry.id);
  }, [current]);

  async function handleFlashcard(grade: ReviewGrade) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const result = await gradeFlashcard(current.entry, grade);
      setResults((previous) => [...previous, result]);
      setFeedback({ result, comment: null });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleSentence(sentence: string) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const { evaluation, result } = await gradeSentence(current.entry, sentence);
      setResults((previous) => [...previous, result]);
      setFeedback({ result, comment: evaluation.feedback });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setFeedback(null);
    setIndex((value) => value + 1);
  }

  function restart() {
    setIndex(0);
    setResults([]);
    setFeedback(null);
    setError(null);
    exposed.current.clear();
    session.reload();
    allWords.reload();
  }

  const finished = items.length > 0 && index >= items.length;
  const totals = tally(results);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Drill"
        title="Vocabulary training"
        description="Words come back when SM-2 says they are due. Weaker words get a flashcard; stronger ones ask you to produce a sentence."
        actions={
          items.length > 0 && !finished ? (
            <Badge tone="neutral">
              {index + 1} of {items.length}
            </Badge>
          ) : undefined
        }
      />

      <InferenceErrorAlert error={error} />

      {session.loading && (
        <Card className="flex items-center gap-3">
          <Spinner />
          <p className="text-ink-300 text-sm">Building your queue…</p>
        </Card>
      )}

      {!session.loading && items.length === 0 && (
        <EmptyState
          title="Nothing is due right now"
          description={
            (allWords.data?.length ?? 0) === 0
              ? 'Your store is empty. Read a passage or write a journal entry to start collecting words, or load the starter list in Settings.'
              : 'Every word you have is scheduled for later. Read or write something new to pick up more.'
          }
          action={
            <div className="flex gap-2">
              <a
                href={hrefFor('/comprehension')}
                className="text-ember-300 hover:text-ember-200 text-sm underline decoration-dotted underline-offset-4"
              >
                Read a passage
              </a>
              <span className="text-ink-700">·</span>
              <a
                href={hrefFor('/settings')}
                className="text-ember-300 hover:text-ember-200 text-sm underline decoration-dotted underline-offset-4"
              >
                Settings
              </a>
            </div>
          }
        />
      )}

      {current && !finished && (
        <>
          <ProgressBar fraction={index / items.length} label={`Word ${index + 1} of ${items.length}`} />

          <Card>
            {feedback ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <Badge tone={feedback.result.passed ? 'success' : 'danger'}>
                    {feedback.result.passed ? 'logged as recalled' : 'logged as missed'}
                  </Badge>
                  <p className="text-ink-200 text-sm">
                    Mastery {feedback.result.masteryBefore} → {feedback.result.masteryAfter}
                    {feedback.result.masteryIncreased ? ' · level up' : ''}
                  </p>
                  <p className="text-ink-500 text-sm">
                    Next review in {Math.max(0, daysUntilDue(feedback.result.entry.srs, Date.now()))}{' '}
                    day
                    {daysUntilDue(feedback.result.entry.srs, Date.now()) === 1 ? '' : 's'} · ease{' '}
                    {feedback.result.entry.srs.easeFactor.toFixed(2)}
                  </p>
                </div>

                {feedback.comment && (
                  <Alert tone={feedback.result.passed ? 'success' : 'warn'}>{feedback.comment}</Alert>
                )}

                <Button variant="primary" size="lg" onClick={next}>
                  {index + 1 >= items.length ? 'Finish session' : 'Next word'}
                </Button>
              </div>
            ) : current.exerciseType === 'flashcard' ? (
              <Flashcard entry={current.entry} busy={busy} onGrade={handleFlashcard} />
            ) : (
              <SentenceExercise entry={current.entry} busy={busy} onSubmit={handleSentence} />
            )}
          </Card>

          <p className="text-ink-600 text-center text-xs">
            Seeing this card counted as one exposure. Only your answer can move mastery.
          </p>
        </>
      )}

      {finished && (
        <Card className="flex flex-col gap-5">
          <h3 className="text-ink-100 font-medium">Session finished</h3>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Reviewed" value={totals.reviewed} />
            <StatTile label="Correct" value={totals.correct} />
            <StatTile label="Levels gained" value={totals.masteryGained} tone="accent" />
          </div>
          <div>
            <Button variant="primary" onClick={restart}>
              Build another queue
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-ink-100 font-medium">Your words</h3>
          <p className="text-ink-600 text-xs">
            Exposure and mastery are tracked separately — the two columns move for different reasons.
          </p>
        </div>
        {allWords.loading && <Spinner />}
        {!allWords.loading && (allWords.data?.length ?? 0) === 0 && (
          <p className="text-ink-500 text-sm">No words yet.</p>
        )}
        {allWords.data && allWords.data.length > 0 && <VocabTable entries={allWords.data} />}
      </Card>
    </div>
  );
}
