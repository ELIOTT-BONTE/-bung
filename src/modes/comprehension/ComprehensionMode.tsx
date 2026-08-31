import { useRef, useState } from 'react';
import { CEFR_LEVELS, type CefrLevel } from '../../inference';
import { normalizeTerm } from '../../storage';
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
import { LookupText } from '../shared/LookupText';
import { VocabPill } from '../shared/VocabPill';
import { WordLookupPanel } from '../shared/WordLookupPanel';
import { useWordLookup } from '../shared/useWordLookup';
import {
  CUSTOM_PASSAGE_WORDS,
  PASSAGE_LENGTHS,
  completeSession,
  evaluateAnswers,
  generatePassage,
  passageLengthById,
  prepareStudyMaterial,
  readCustomLength,
  type CompletionResult,
  type EvaluationOutcome,
  type PassageLengthId,
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

/** The presets, plus the escape hatch for a length none of them covers. */
type LengthChoice = PassageLengthId | 'custom';

export function ComprehensionMode() {
  const [phase, setPhase] = useState<Phase>('theme');
  const [theme, setTheme] = useState('');
  const [level, setLevel] = useState<CefrLevel>('A2');
  const [lengthChoice, setLengthChoice] = useState<LengthChoice>('medium');
  const [customLength, setCustomLength] = useState('');
  const [passage, setPassage] = useState('');
  const [material, setMaterial] = useState<StudyMaterial | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<EvaluationOutcome | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [materialError, setMaterialError] = useState<unknown>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  // What was actually asked for, so the badge on a finished passage keeps
  // describing that passage even after the controls move on.
  const [requestedWords, setRequestedWords] = useState(140);
  const requestId = useRef(0);
  const lookup = useWordLookup(material?.vocab ?? []);

  const trimmedTheme = theme.trim();
  // Flagged words are suggestions; these are the ones the learner actually has.
  const ownedEntries = (material?.vocab ?? []).flatMap((word) =>
    word.entry ? [word.entry] : [],
  );
  const addedByTerm = new Map(
    lookup.added.map((entry) => [normalizeTerm(entry.term), entry]),
  );
  const customLengthReading = readCustomLength(customLength);
  const targetWords =
    lengthChoice === 'custom'
      ? customLengthReading.words
      : passageLengthById(lengthChoice).approximateWords;
  const busy = phase === 'generating' || phase === 'evaluating';

  async function loadQuestions(text: string, id: number, selectedLevel: CefrLevel) {
    setMaterialLoading(true);
    setMaterialError(null);
    try {
      const prepared = await prepareStudyMaterial(text, { level: selectedLevel });
      if (id !== requestId.current) return;
      setMaterial(prepared);
      setAnswers(prepared.questions.map(() => ''));
    } catch (caught) {
      if (id !== requestId.current) return;
      setMaterialError(caught);
    } finally {
      if (id === requestId.current) setMaterialLoading(false);
    }
  }

  async function start() {
    if (targetWords === null) return;

    const id = ++requestId.current;
    setError(null);
    setMaterialError(null);
    setMaterial(null);
    setAnswers([]);
    lookup.reset();
    setRequestedWords(targetWords);
    setPhase('generating');
    setStatus('Writing a passage on your theme…');

    try {
      const generated = await generatePassage(trimmedTheme, {
        level,
        approximateWords: targetWords,
      });
      if (id !== requestId.current) return;

      setPassage(generated);
      setPhase('reading');
      void loadQuestions(generated, id, level);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught);
      setPhase('theme');
    }
  }

  async function submit() {
    if (!material) return;
    setError(null);
    setPhase('evaluating');

    // The evaluator hears about every key word, but only words the learner
    // actually holds can be credited — which now means the ones they already
    // had plus the ones they chose to add while reading.
    const flaggedTerms = new Set(material.vocab.map((word) => normalizeTerm(word.draft.term)));
    const tracked = [
      ...material.vocab.map((word) => ({
        term: word.draft.term,
        vocabId:
          word.entry?.id ?? addedByTerm.get(normalizeTerm(word.draft.term))?.id ?? null,
      })),
      // Words they looked up that the passage never flagged.
      ...lookup.added
        .filter((entry) => !flaggedTerms.has(normalizeTerm(entry.term)))
        .map((entry) => ({ term: entry.term, vocabId: entry.id })),
    ];

    try {
      setStatus('Reading your answers…');
      const evaluated = await evaluateAnswers(passage, material.questions, answers, tracked);
      setOutcome(evaluated);

      setStatus('Saving the session…');
      const saved = await completeSession({
        theme: trimmedTheme,
        passage,
        answers: evaluated.answers,
        knownVocab: ownedEntries,
        lookedUpVocab: lookup.added,
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
    requestId.current += 1;
    lookup.reset();
    setPhase('theme');
    setPassage('');
    setMaterial(null);
    setAnswers([]);
    setOutcome(null);
    setCompletion(null);
    setError(null);
    setMaterialError(null);
    setMaterialLoading(false);
  }

  const masteryIds = new Set(outcome?.masteryVocabIds ?? []);
  const showPassage = phase === 'reading' || phase === 'evaluating' || phase === 'result';

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Read"
        title="Text comprehension"
        description="A passage at the level you pick, built around the words you already have. Answer in German, in your own words — there are no multiple-choice options."
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
            <p className="text-ink-300 mb-2 text-sm font-medium">Level</p>
            <div className="flex flex-wrap gap-2">
              {CEFR_LEVELS.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={level === option}
                  onSelect={() => setLevel(option)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-ink-300 mb-2 text-sm font-medium">Length</p>
            <div className="flex flex-wrap gap-2">
              {PASSAGE_LENGTHS.map((option) => (
                <Chip
                  key={option.id}
                  label={`${option.label} · ~${option.approximateWords} words`}
                  selected={lengthChoice === option.id}
                  onSelect={() => setLengthChoice(option.id)}
                />
              ))}
              <Chip
                label="Custom…"
                selected={lengthChoice === 'custom'}
                onSelect={() => setLengthChoice('custom')}
              />
            </div>

            {lengthChoice === 'custom' && (
              <TextInput
                label="Words"
                type="number"
                inputMode="numeric"
                min={CUSTOM_PASSAGE_WORDS.min}
                max={CUSTOM_PASSAGE_WORDS.max}
                placeholder={`${CUSTOM_PASSAGE_WORDS.min}–${CUSTOM_PASSAGE_WORDS.max}`}
                value={customLength}
                autoFocus
                wrapperClassName="mt-3 max-w-[15rem]"
                invalid={customLengthReading.problem !== null}
                onChange={(event) => setCustomLength(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void start();
                }}
                hint={
                  customLengthReading.problem ??
                  `Anything from ${CUSTOM_PASSAGE_WORDS.min} to ${CUSTOM_PASSAGE_WORDS.max}. The model aims for this, it does not count.`
                }
              />
            )}
          </div>

          <div>
            <Button
              variant="primary"
              size="lg"
              onClick={start}
              disabled={targetWords === null}
              title={targetWords === null ? 'Type how many words you want first' : undefined}
            >
              Generate passage
            </Button>
          </div>
        </Card>
      )}

      {phase === 'generating' && (
        <Card className="flex items-center gap-3">
          <Spinner />
          <p className="text-ink-300 text-sm">{status}</p>
        </Card>
      )}

      {showPassage && passage !== '' && (
        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-ink-100 font-medium">
              {trimmedTheme === '' ? 'Your passage' : `Passage: ${trimmedTheme}`}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{level}</Badge>
              <Badge tone="neutral">~{requestedWords} words</Badge>
              {material ? (
                <Badge tone="neutral">{material.vocab.length} key words flagged</Badge>
              ) : materialLoading ? (
                <Badge tone="accent">
                  <Spinner className="size-3" /> preparing questions
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Held back while answers are being marked: on the local tier a
              lookup would queue behind that call and slow both down. */}
          <LookupText
            text={passage}
            onLookup={lookup.request}
            disabled={phase === 'evaluating'}
          />

          {material && material.vocab.length > 0 && (
            <div className="border-ink-800/70 border-t pt-4">
              <p className="text-ink-500 mb-2 text-xs tracking-wide uppercase">
                Key vocabulary in this passage
              </p>
              <div className="flex flex-wrap gap-2">
                {material.vocab.map((word) => {
                  const owned = word.entry ?? addedByTerm.get(normalizeTerm(word.draft.term));

                  if (owned) {
                    return (
                      <VocabPill
                        key={word.draft.term}
                        entry={owned}
                        highlighted={phase === 'result' && masteryIds.has(owned.id)}
                      />
                    );
                  }

                  // Not in their vocabulary and not going in by itself. Tapping
                  // opens the same card as tapping the word in the passage.
                  return (
                    <button
                      key={word.draft.term}
                      type="button"
                      onClick={() =>
                        lookup.request({ surface: word.draft.term, sentence: passage })
                      }
                      className="border-ink-800 text-ink-400 hover:border-ink-700 hover:text-ink-200 inline-flex items-baseline gap-1.5 rounded-lg border border-dashed px-2.5 py-1 text-sm transition-colors duration-150"
                    >
                      <span className="font-reading">{word.draft.term}</span>
                      <span className="text-ink-600 text-xs">add</span>
                    </button>
                  );
                })}
              </div>
              {phase !== 'result' && (
                <p className="text-ink-600 mt-2 text-xs">
                  Dashed words are suggestions — nothing is saved to your vocabulary until you add
                  it. Words you already have earn exposure for being read here; mastery moves only
                  when your answers show you understood them.
                </p>
              )}
            </div>
          )}

          {material && material.rejected.length > 0 && (
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

      {showPassage && passage !== '' && (
        <WordLookupPanel lookup={lookup} fallbackSentence={passage} />
      )}

      {(phase === 'reading' || phase === 'evaluating') && materialLoading && !material && (
        <Card className="flex items-center gap-3">
          <Spinner />
          <p className="text-ink-300 text-sm">
            Pulling out questions and key vocabulary — you can start reading in the meantime.
          </p>
        </Card>
      )}

      {(phase === 'reading' || phase === 'evaluating') && materialError !== null && !material && (
        <Card className="flex flex-col gap-3">
          <InferenceErrorAlert error={materialError} />
          <div>
            <Button variant="secondary" onClick={() => void loadQuestions(passage, ++requestId.current, level)}>
              Try questions again
            </Button>
          </div>
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

      {phase === 'evaluating' && (
        <Card className="flex items-center gap-3">
          <Spinner />
          <p className="text-ink-300 text-sm">{status}</p>
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
              {completion.exposedCount === 0
                ? 'No exposures: none of this passage’s vocabulary is in your list yet. Tap a word and add it to start tracking it.'
                : `${completion.exposedCount} of your words got one exposure each for turning up here — that number tracks familiarity, not knowledge, and never moves mastery on its own.`}{' '}
              {completion.masteryResults.length === 0
                ? 'No word earned a mastery event this time: add the words you want to track, then use them in your answers.'
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
