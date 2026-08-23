import {
  countComprehensionSessions,
  countJournalEntries,
  getVocabStats,
  type VocabStats,
} from '../storage';
import { Button, Card, SectionHeading, StatTile, cn } from '../ui';
import { hrefFor, type Route } from './router';
import { useAsync } from './useAsync';

interface Overview {
  vocab: VocabStats;
  journalEntries: number;
  sessions: number;
}

async function loadOverview(): Promise<Overview> {
  const [vocab, journalEntries, sessions] = await Promise.all([
    getVocabStats(),
    countJournalEntries(),
    countComprehensionSessions(),
  ]);
  return { vocab, journalEntries, sessions };
}

interface ModeCard {
  route: Route;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
}

const MODES: readonly ModeCard[] = [
  {
    route: '/comprehension',
    eyebrow: 'Read',
    title: 'Text comprehension',
    description:
      'Generate a passage on a theme of your choice, answer open questions about it in German, and get your answers evaluated.',
    detail: 'Words in the passage count as exposure. Words your answers show you understood count for mastery.',
  },
  {
    route: '/journal',
    eyebrow: 'Write',
    title: 'Journaling',
    description:
      'Write freely in German. If something needs fixing you get a corrected version with a word-level diff of the changes.',
    detail: 'Words you used correctly, or used and then internalised the correction for, count for mastery.',
  },
  {
    route: '/vocab',
    eyebrow: 'Drill',
    title: 'Vocabulary training',
    description:
      'Review the words that are due. Low-mastery words come back as flashcards; stronger ones ask you to use them in a sentence.',
    detail: 'Every answer is logged and schedules the next review with SM-2.',
  },
];

export function Home() {
  const { data, loading } = useAsync(loadOverview, []);
  const stats = data?.vocab;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <p className="text-ember-400/90 mb-2 text-xs font-medium tracking-[0.14em] uppercase">
          Übung · German
        </p>
        <h1 className="text-ink-100 text-balance-title max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Read something new, write something of your own, then drill what stuck.
        </h1>
        <p className="text-ink-400 mt-4 max-w-2xl leading-relaxed">
          Three modes that feed one vocabulary store. Seeing a word is tracked separately from
          knowing it, so your mastery numbers only move when you actually produce or recall
          something.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Words tracked"
          value={loading ? '—' : (stats?.total ?? 0)}
          hint={stats ? `${stats.totalExposures} exposures logged` : undefined}
        />
        <StatTile
          label="Due now"
          value={loading ? '—' : (stats?.due ?? 0)}
          tone="accent"
          hint="ready to review"
        />
        <StatTile
          label="Seen, not known"
          value={loading ? '—' : (stats?.exposedOnly ?? 0)}
          hint="exposure only, no mastery event"
        />
        <StatTile
          label="Strong words"
          value={loading ? '—' : (stats?.mastered ?? 0)}
          hint="mastery 4 or 5"
        />
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading
          eyebrow="Modes"
          title="What do you want to practise?"
          description={
            data
              ? `${data.sessions} reading session${data.sessions === 1 ? '' : 's'} and ${data.journalEntries} journal entr${data.journalEntries === 1 ? 'y' : 'ies'} so far.`
              : undefined
          }
        />

        <div className="grid gap-4 lg:grid-cols-3">
          {MODES.map((mode) => (
            <Card
              key={mode.route}
              className={cn(
                'hover:border-ink-700 flex flex-col gap-4 transition-colors duration-150',
              )}
            >
              <div>
                <p className="text-ember-400/90 text-xs font-medium tracking-[0.14em] uppercase">
                  {mode.eyebrow}
                </p>
                <h3 className="text-ink-100 mt-1.5 text-lg font-semibold tracking-tight">
                  {mode.title}
                </h3>
              </div>
              <p className="text-ink-400 flex-1 text-sm leading-relaxed">{mode.description}</p>
              <p className="text-ink-600 border-ink-800/70 border-t pt-3 text-xs leading-relaxed">
                {mode.detail}
              </p>
              <Button variant="secondary" onClick={() => (window.location.hash = mode.route)}>
                Open {mode.title.toLowerCase()}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {!loading && stats?.total === 0 && (
        <Card className="flex flex-col gap-3">
          <h3 className="text-ink-100 font-medium">Your vocabulary store is empty</h3>
          <p className="text-ink-400 text-sm leading-relaxed">
            Words arrive on their own as you read and write. If you would rather have something to
            drill right away, Settings has an optional 32-word starter list.
          </p>
          <a
            href={hrefFor('/settings')}
            className="text-ember-300 hover:text-ember-200 text-sm underline decoration-dotted underline-offset-4"
          >
            Load starter vocabulary
          </a>
        </Card>
      )}
    </div>
  );
}
