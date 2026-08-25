import { useState } from 'react';
import { detectCapabilities } from '../inference';
import {
  clearAllData,
  countComprehensionSessions,
  countJournalEntries,
  getVocabStats,
  loadStarterVocab,
  STARTER_VOCAB,
} from '../storage';
import { Alert, Badge, Button, Card, SectionHeading, TextInput } from '../ui';
import { ApiKeyFields, ChainOrder } from './ProviderChain';
import { useSettings } from './settings';
import { ModelPreparation, TierPicker } from './TierPicker';
import { useAsync } from './useAsync';

async function loadDataSummary() {
  const [vocab, journalEntries, sessions] = await Promise.all([
    getVocabStats(),
    countJournalEntries(),
    countComprehensionSessions(),
  ]);
  return { vocab, journalEntries, sessions };
}

export function SettingsScreen() {
  const { settings, activeTier, update } = useSettings();
  const { data: report } = useAsync(detectCapabilities, []);
  const summary = useAsync(loadDataSummary, []);

  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'seed' | 'reset' | null>(null);

  async function loadSeed() {
    setBusy('seed');
    try {
      const result = await loadStarterVocab();
      await update({ starterVocabLoaded: true });
      setSeedMessage(
        result.inserted === 0
          ? 'Every starter word was already in your store — nothing to add.'
          : `Added ${result.inserted} word${result.inserted === 1 ? '' : 's'}. They are due for review now, at mastery 0.`,
      );
      summary.reload();
    } finally {
      setBusy(null);
    }
  }

  async function resetEverything() {
    const confirmed = window.confirm(
      'Delete all vocabulary, review history, journal entries and settings in this browser? This cannot be undone.',
    );
    if (!confirmed) return;

    setBusy('reset');
    try {
      await clearAllData();
      window.location.hash = '/';
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Settings"
        title="Inference, data and storage"
        description="Your vocabulary and writing stay in this browser profile. Generation can be handed to a hosted model if you give it a key."
      />

      <Card className="flex flex-col gap-5">
        <div>
          <h3 className="text-ink-100 font-medium">Hosted providers</h3>
          <p className="text-ink-500 mt-1 text-sm leading-relaxed">
            Each generation is offered to these free tiers in order, and the first one that answers
            wins. A provider with no key is skipped, so this is entirely optional — leave all three
            blank and everything runs locally, exactly as before. Keys are stored in this browser
            only, but the prompts themselves do leave your machine, so avoid writing anything
            private in your journal while a provider is configured.
          </p>
        </div>

        <ApiKeyFields />
      </Card>

      <Card className="flex flex-col gap-5">
        <div>
          <h3 className="text-ink-100 font-medium">Local engine</h3>
          <p className="text-ink-500 mt-1 text-sm leading-relaxed">
            The last candidate in the chain, used when no hosted provider can answer. WebGPU is
            offered only when this device actually grants an adapter; the WASM tier works everywhere.
            Switching does not delete the other one&apos;s cached weights, so you can move back
            without downloading again.
          </p>
        </div>

        <TierPicker
          selected={activeTier}
          onSelect={(tier) => void update({ activeTier: tier })}
          report={report}
        />
        <ModelPreparation tier={activeTier} />

        <div className="border-ink-800/70 border-t pt-4">
          <p className="text-ink-400 mb-2 text-xs font-medium tracking-wide uppercase">
            Order requests are tried in
          </p>
          <ChainOrder localTier={activeTier} />
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <div>
          <h3 className="text-ink-100 font-medium">Vocabulary</h3>
          <p className="text-ink-500 mt-1 text-sm leading-relaxed">
            The store starts empty and fills up as you read and write. The optional starter list adds{' '}
            {STARTER_VOCAB.length} common German words at mastery 0, so vocabulary training has
            something to schedule on a fresh install.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={loadSeed} disabled={busy !== null}>
            {busy === 'seed' ? 'Adding…' : 'Load starter vocabulary'}
          </Button>
          {settings.starterVocabLoaded && <Badge tone="success">already loaded once</Badge>}
        </div>

        {seedMessage && <Alert tone="success">{seedMessage}</Alert>}

        <TextInput
          label="Words per training session"
          type="number"
          min={4}
          max={40}
          value={settings.dailyReviewTarget}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(parsed)) {
              void update({ dailyReviewTarget: Math.max(4, Math.min(40, parsed)) });
            }
          }}
          hint="How many due words a vocabulary training session pulls at most."
          wrapperClassName="max-w-52"
        />
      </Card>

      <Card className="flex flex-col gap-5">
        <div>
          <h3 className="text-ink-100 font-medium">Stored data</h3>
          <p className="text-ink-500 mt-1 text-sm leading-relaxed">
            Held in IndexedDB under <code className="text-ink-300 font-mono">german-trainer</code>. It
            is not synced, not backed up and not visible to anyone else. Clearing your browser&apos;s
            site data removes it.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            { label: 'Vocabulary', value: summary.data?.vocab.total ?? 0 },
            { label: 'Review events', value: summary.data?.vocab.masteryEvents ?? 0 },
            { label: 'Journal entries', value: summary.data?.journalEntries ?? 0 },
            { label: 'Reading sessions', value: summary.data?.sessions ?? 0 },
          ].map((item) => (
            <div key={item.label} className="border-ink-800/70 border-t pt-2">
              <dt className="text-ink-500 text-xs">{item.label}</dt>
              <dd className="text-ink-100 mt-0.5 text-lg font-semibold tabular-nums">
                {summary.loading ? '—' : item.value}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <Button variant="danger" onClick={resetEverything} disabled={busy !== null}>
            {busy === 'reset' ? 'Deleting…' : 'Delete all local data'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
