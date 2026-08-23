import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  SectionHeading,
  Spinner,
  StatTile,
  TextArea,
  TextInput,
} from '../../ui';
import { InferenceErrorAlert } from '../shared/InferenceErrorAlert';
import { VocabPill } from '../shared/VocabPill';
import {
  completeSession,
  evaluateAnswers,
  generatePassage,
  prepareStudyMaterial,
  type CompletionResult,
  type EvaluationOutcome,
  type StudyMaterial,
} from './pipeline';

const CURATED_THEMES: readonly string[] = [
  'Alltag',
  'Reisen',
  'Arbeit',
  'Essen und Kochen',
  'Nachrichten',
  'Technik',
];

type Phase = 'theme' | 'generating' | 'reading' | 'evaluating' | 'result';

export function ComprehensionMode() {
  const [phase, setPhase] = useState<Phase>('theme');
  const [theme, setTheme] = useState('');
  const [passage, setPassage] = useState('');
  const [material, setMaterial] = useState<StudyMaterial | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<EvaluationOutcome | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<unknown>(null);

  const trimmedTheme = theme.trim();

  async function start() {
    setError(null);
    setPhase('generating');

    try {
      setStatus('Writing a passage on your theme…');
      const generated = await generatePassage(trimmedTheme);
      setPassage(generated);

      setStatus('Pulling out questions and key vocabulary…');
      const prepared = await prepareStudyMaterial(generated);
      setMaterial(prepared);
      setAnswers(prepared.questions.map(() => ''));
      setPhase('reading');
    } catch (caught) {
      setError(caught);
      setPhase('theme');
    }
  }

  async function submit() {
    if (!material) return;
    setError(null);
    setPhase('evaluating');

    try {
      setStatus('Reading your answers…');
      const evaluated = await evaluateAnswers(passage, material.questions, answers, material.vocab);
      setOutcome(evaluated);

      setStatus('Saving the session…');
      const saved = await completeSession({
        theme: trimmedTheme,
        passage,
        answers: evaluated.answers,
        vocab: material.vocab,
        masteryVocabIds: evaluated.masteryVocabIds,
      });
      setCompletion(saved);
      setPhase('result');
    } catch (caught) {
      setError(caught);
      setPhase('reading');
    }
  }

  function restart() {
    setPhase('theme');
    setPassage('');
    setMaterial(null);
    setAnswers([]);
    setOutcome(null);
    setCompletion(null);
    setError(null);
  }

  const busy = phase === 'generating' || phase === 'evaluating';
  const masteryIds = new Set(outcome?.masteryVocabIds ?? []);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Read"
        title="Text comprehension"
        description="A passage built around the words you already have, plus a few new ones. Answer in German, in your own words — there are no multiple-choice options."
        actions={
          phase !== 'theme' ? (
            <Button variant="ghost" onClick={restart} disabled={busy}>
              Start over
            </Button>
          ) : undefined
        }
      />

      <InferenceErrorAlert error={error} />

      {phase === 'theme' && (
        <Card className="flex flex-col gap-5">
          <div>
            <h3 className="text-ink-100 font-medium">Pick a theme</h3>
            <p className="text-ink-500 mt-1 text-sm">
              Anything works — a topic, a situation, a mood. Leave it empty for a general passage.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {CURATED_THEMES.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={trimmedTheme === option}
                onSelect={() => setTheme(option)}
              />
            ))}
          </div>

          <TextInput
            label="Or write your own"
            placeholder="z. B. ein Wochenende in Wien"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void start();
            }}
          />

          <div>
            <Button variant="primary" size="lg" onClick={start}>
              Generate passage
            </Button>
          </div>
        </Card>
      )}

      {busy && (
        <Card className="flex items-center gap-3">
          <Spinner />
          <p className="text-ink-300 text-sm">{status}</p>
        </Card>
      )}

      {(phase === 'reading' || phase === 'evaluating' || phase === 'result') && material && (
        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-ink-100 font-medium">
              {trimmedTheme === '' ? 'Your passage' : `Passage: ${trimmedTheme}`}
            </h3>
            <Badge tone="neutral">{material.vocab.length} key words flagged</Badge>
          </div>

          <p className="font-reading text-ink-100 text-[1.12rem] leading-[1.85] whitespace-pre-line">
            {passage}
          </p>

          {material.vocab.length > 0 && (
            <div className="border-ink-800/70 border-t pt-4">
              <p className="text-ink-500 mb-2 text-xs tracking-wide uppercase">
                Key vocabulary in this passage
              </p>
              <div className="flex flex-wrap gap-2">
                {material.vocab.map((entry) => (
                  <VocabPill
                    key={entry.id}
                    entry={entry}
                    highlighted={phase === 'result' && masteryIds.has(entry.id)}
                  />
                ))}
              </div>
              {phase !== 'result' && (
                <p className="text-ink-600 mt-2 text-xs">
                  Reading these counts as exposure only. Mastery moves when your answers show you
                  understood them.
                </p>
              )}
            </div>
          )}

          {material.rejected.length > 0 && (
            <Alert tone="warn" title="Some flagged words were not saved">
              <ul className="mt-1 space-y-0.5">
                {material.rejected.map((item) => (
                  <li key={item.term}>
                    <span className="font-reading">{item.term}</span> — {item.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </Card>
      )}

      {(phase === 'reading' || phase === 'evaluating') && material && (
        <Card className="flex flex-col gap-6">
          <h3 className="text-ink-100 font-medium">Answer in German</h3>

          {material.questions.map((question, index) => (
            <TextArea
              key={question}
              label={`${index + 1}. ${question}`}
              reading
              rows={3}
              value={answers[index] ?? ''}
              disabled={phase === 'evaluating'}
              onChange={(event) => {
                const next = [...answers];
                next[index] = event.target.value;
                setAnswers(next);
              }}
            />
          ))}

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={submit}
              disabled={phase === 'evaluating' || answers.every((answer) => answer.trim() === '')}
            >
              Submit answers
            </Button>
            <span className="text-ink-600 text-xs">
              Unanswered questions are marked wrong, nothing else happens.
            </span>
          </div>
        </Card>
      )}

      {phase === 'result' && outcome && completion && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Answers correct"
              value={`${outcome.answers.filter((answer) => answer.correct).length}/${outcome.answers.length}`}
            />
            <StatTile label="Exposures recorded" value={completion.exposedCount} />
            <StatTile
              label="Mastery events"
              value={completion.masteryResults.length}
              tone="accent"
              hint="active understanding shown"
            />
            <StatTile
              label="Levels gained"
              value={completion.masteryResults.filter((result) => result.masteryIncreased).length}
            />
          </div>

          <Card className="flex flex-col gap-5">
            <h3 className="text-ink-100 font-medium">Evaluation</h3>
            {outcome.answers.map((record, index) => (
              <div key={index} className="border-ink-800/70 border-t pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={record.correct ? 'success' : 'danger'}>
                    {record.correct ? 'correct' : 'not yet'}
                  </Badge>
                  <p className="text-ink-300 font-reading text-sm">{record.question}</p>
                </div>
                <p className="font-reading text-ink-200 mt-2 text-[1.02rem] leading-relaxed whitespace-pre-line">
                  {record.answer.trim() === '' ? '—' : record.answer}
                </p>
                <p className="text-ink-500 mt-2 text-sm leading-relaxed">{record.feedback}</p>
                {record.demonstratedTerms.length > 0 && (
                  <p className="text-sage-300/80 mt-1.5 text-xs">
                    Demonstrated: {record.demonstratedTerms.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </Card>

          <Card className="flex flex-col gap-3">
            <h3 className="text-ink-100 font-medium">What this session changed</h3>
            <p className="text-ink-400 text-sm leading-relaxed">
              All {completion.exposedCount} flagged words got one exposure each — that number tracks
              familiarity, not knowledge, and never moves mastery on its own.{' '}
              {completion.masteryResults.length === 0
                ? 'No word earned a mastery event this time: use the key vocabulary in your answers to change that.'
                : `${completion.masteryResults.length} word${completion.masteryResults.length === 1 ? '' : 's'} earned a logged mastery event and a new review date.`}
            </p>
            {completion.masteryResults.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {completion.masteryResults.map((result) => (
                  <VocabPill key={result.entry.id} entry={result.entry} highlighted />
                ))}
              </div>
            )}
            <div className="pt-1">
              <Button variant="primary" onClick={restart}>
                Read something else
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
