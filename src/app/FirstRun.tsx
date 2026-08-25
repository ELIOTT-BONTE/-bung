import { useState } from 'react';
import { detectCapabilities, preferredTier, type LocalInferenceTier } from '../inference';
import { Button, Card } from '../ui';
import { useSettings } from './settings';
import { ModelPreparation, TierPicker } from './TierPicker';
import { useAsync } from './useAsync';
import { BrandMark } from './BrandMark';

const FACTS: readonly { title: string; body: string }[] = [
  {
    title: 'No server, no account',
    body: 'The whole app is a static bundle. Out of the box nothing you write leaves this device, because there is nowhere for it to go.',
  },
  {
    title: 'The model runs in your browser',
    body: 'Weights come straight from Hugging Face and are cached, so you pay that wait once — and only if you need it.',
  },
  {
    title: 'Or borrow a free hosted one',
    body: 'Settings can hold free API keys for Mistral, Gemini or Groq. Give it one and generation is instant, with no download at all.',
  },
];

export function FirstRun() {
  const { settings, update } = useSettings();
  const { data: report } = useAsync(detectCapabilities, []);
  const [tier, setTier] = useState<LocalInferenceTier | null>(null);
  const [saving, setSaving] = useState(false);

  // Default the selection to the best tier this device can actually run, but
  // only once detection has finished, so nothing flickers.
  const selected: LocalInferenceTier = tier ?? (report ? preferredTier(report) : 'mock');

  /**
   * Saved on selection rather than on "Start learning", so that the tier the
   * download button prepares is genuinely the active one.
   */
  function selectTier(next: LocalInferenceTier) {
    setTier(next);
    void update({ activeTier: next });
  }

  async function start() {
    setSaving(true);
    try {
      await update({ activeTier: selected, firstRunCompleted: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-3">
        <BrandMark />
        <div>
          <p className="text-ink-100 text-lg font-semibold tracking-tight">Übung</p>
          <p className="text-ink-500 text-sm">German reading &amp; writing trainer</p>
        </div>
      </div>

      <Card className="flex flex-col gap-8">
        <div>
          <h1 className="text-ink-100 text-balance-title text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything happens in this browser
          </h1>
          <p className="text-ink-400 mt-3 text-sm leading-relaxed">
            Read generated passages, keep a journal that gets corrected, and drill the words you meet
            along the way. Three things worth knowing before you start:
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            {FACTS.map((fact) => (
              <div key={fact.title} className="border-ink-800/70 border-t pt-3">
                <dt className="text-ink-200 text-sm font-medium">{fact.title}</dt>
                <dd className="text-ink-500 mt-1 text-xs leading-relaxed">{fact.body}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="text-ink-100 font-medium">Choose the engine on this device</h2>
          <p className="text-ink-500 mt-1 mb-4 text-sm leading-relaxed">
            This is what answers when no hosted provider is configured, so it is worth setting even
            if you plan to add an API key later. Downloading now is optional — it happens on first
            use otherwise, and never at all while a hosted provider is answering. The mock tier needs
            no download and walks through every mode with canned German.
          </p>
          <TierPicker selected={selected} onSelect={selectTier} report={report} />
          <ModelPreparation tier={selected} className="mt-4" />
        </div>

        <div className="border-ink-800/70 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <p className="text-ink-500 text-xs">
            Current choice: <span className="text-ink-300">{selected}</span>
            {settings.firstRunCompleted ? ' · already set up' : ''}
          </p>
          <Button variant="primary" size="lg" onClick={start} disabled={saving}>
            {saving ? 'Saving…' : 'Start learning'}
          </Button>
        </div>
      </Card>
    </main>
  );
}
