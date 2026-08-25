/**
 * The hosted provider half of the settings screen: which providers will be
 * tried, in what order, and where their keys come from.
 */

import { useEffect, useState } from 'react';
import {
  apiKeySource,
  getBackend,
  hasApiKey,
  listHostedBackends,
  API_KEY_ENV_VARS,
  type HostedProviderId,
  type LocalInferenceTier,
} from '../inference';
import { Badge, TextInput, cn } from '../ui';
import { useSettings } from './settings';

const CONSOLES: Readonly<Record<HostedProviderId, { url: string; label: string }>> = {
  mistral: { url: 'https://console.mistral.ai/api-keys', label: 'console.mistral.ai' },
  gemini: { url: 'https://aistudio.google.com/apikey', label: 'aistudio.google.com' },
  groq: { url: 'https://console.groq.com/keys', label: 'console.groq.com' },
};

/** Provider-specific gotchas worth saying before the user hits them. */
const CAVEATS: Partial<Record<HostedProviderId, string>> = {
  gemini:
    'Must be a restricted or auth key — unrestricted keys are rejected. Free-tier input may be used to improve Google models.',
  groq: 'Free tier allows 30 requests a minute and 1,000 a day, per organisation.',
};

export function ApiKeyFields() {
  const { settings, update } = useSettings();

  // Held locally while typing and saved on blur, so a key is not written to
  // IndexedDB one character at a time.
  const [drafts, setDrafts] = useState<Record<string, string>>(settings.apiKeys);

  useEffect(() => {
    setDrafts(settings.apiKeys);
  }, [settings.apiKeys]);

  function save(provider: HostedProviderId) {
    const next = { ...settings.apiKeys, [provider]: drafts[provider] ?? '' };
    if (next[provider].trim() === '') delete next[provider];
    if (next[provider] === settings.apiKeys[provider]) return;
    void update({ apiKeys: next });
  }

  return (
    <div className="flex flex-col gap-5">
      {listHostedBackends().map((backend) => {
        const provider = backend.tier;
        const source = apiKeySource(provider);
        const consoleLink = CONSOLES[provider];
        const caveat = CAVEATS[provider];

        return (
          <div key={provider} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-100 text-sm font-medium">{backend.label}</span>
              <code className="text-ink-600 font-mono text-xs">{backend.model.id}</code>
              {source === 'settings' && <Badge tone="success">key saved</Badge>}
              {source === 'env' && <Badge tone="accent">from {API_KEY_ENV_VARS[provider]}</Badge>}
              {source === null && <Badge tone="neutral">skipped</Badge>}
            </div>

            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label={`${backend.label} API key`}
              placeholder={source === 'env' ? 'Set at build time — type here to override' : 'Paste an API key'}
              value={drafts[provider] ?? ''}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [provider]: event.target.value }))
              }
              onBlur={() => save(provider)}
              hint={
                <>
                  Free key from{' '}
                  <a
                    className="text-ember-300 hover:text-ember-200 underline decoration-dotted underline-offset-4"
                    href={consoleLink.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {consoleLink.label}
                  </a>
                  . {caveat}
                </>
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export interface ChainOrderProps {
  localTier: LocalInferenceTier;
  className?: string;
}

/** The candidate list in the order `generateText` will actually walk it. */
export function ChainOrder({ localTier, className }: ChainOrderProps) {
  const local = getBackend(localTier);
  const candidates = [
    ...listHostedBackends().map((backend) => ({
      label: backend.label,
      detail: backend.model.id,
      usable: hasApiKey(backend.tier),
      skippedReason: 'no key',
    })),
    { label: local.label, detail: local.model.id, usable: true, skippedReason: '' },
  ];

  return (
    <ol className={cn('flex flex-col gap-1.5', className)}>
      {candidates.map((candidate, index) => (
        <li
          key={candidate.label}
          className={cn(
            'flex flex-wrap items-center gap-2 text-sm',
            !candidate.usable && 'opacity-45',
          )}
        >
          <span className="text-ink-600 w-4 text-right font-mono text-xs tabular-nums">
            {index + 1}
          </span>
          <span className="text-ink-200">{candidate.label}</span>
          <code className="text-ink-600 font-mono text-xs">{candidate.detail}</code>
          {!candidate.usable && (
            <span className="text-ink-600 text-xs">— skipped, {candidate.skippedReason}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
