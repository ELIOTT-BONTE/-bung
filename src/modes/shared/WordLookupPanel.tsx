/**
 * Where a looked-up word is answered.
 *
 * A card under the text rather than a popover anchored to the word: no
 * positioning or overflow work, it behaves the same on a phone, and it has room
 * to keep the words already looked up in this passage, which turns out to be the
 * more useful surface — that list is what the learner adds from.
 *
 * The text input is not a convenience. Word spans are not focusable (see
 * `LookupText`), so this is the only way to use the feature from a keyboard, and
 * it doubles as a way to look up a word that is not in the passage at all.
 */

import { useState } from 'react';
import { PART_OF_SPEECH_LABELS } from '../../storage';
import { Alert, Badge, Button, Card, Spinner, TextInput } from '../../ui';
import { InferenceErrorAlert } from './InferenceErrorAlert';
import { VocabPill } from './VocabPill';
import { masteryLabelFor } from './vocabView';
import { lookupDisplay, type LookupResolution } from './wordLookup';
import type { WordLookupController } from './useWordLookup';

function SourceNote({ resolution }: { resolution: LookupResolution }) {
  if (resolution.kind !== 'known') return null;
  return (
    <p className="text-ink-600 text-xs">
      Already in your vocabulary — {masteryLabelFor(resolution.entry)}.
    </p>
  );
}

function Resolved({
  resolution,
  adding,
  onAdd,
}: {
  resolution: LookupResolution;
  adding: boolean;
  onAdd: () => void;
}) {
  const display = lookupDisplay(resolution);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-reading text-ink-100 text-[1.15rem]">{display.form}</p>
          <p className="text-ink-400 mt-0.5 text-sm">
            {display.definition || 'No definition came back for this word.'}
          </p>
        </div>
        <Badge tone="neutral">{PART_OF_SPEECH_LABELS[display.partOfSpeech]}</Badge>
      </div>

      {resolution.surfaceRole && (
        <p className="text-ink-500 text-xs">
          You tapped <span className="font-reading">{resolution.target.surface}</span> —{' '}
          {resolution.surfaceRole}.
        </p>
      )}

      <SourceNote resolution={resolution} />

      {resolution.kind === 'new' && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onAdd} disabled={adding}>
            {adding ? 'Adding…' : 'Add to vocabulary'}
          </Button>
          <span className="text-ink-600 text-xs">
            Saving a word records nothing on its own — it counts as exposure when you finish the
            session.
          </span>
        </div>
      )}

      {resolution.kind === 'unusable' && (
        <Alert tone="warn" title="Not saved">
          {resolution.rejected.reason}. You can still read the meaning above.
        </Alert>
      )}
    </div>
  );
}

export interface WordLookupPanelProps {
  lookup: WordLookupController;
  /** The sentence handed to a typed lookup, which has no passage context. */
  fallbackSentence?: string;
}

export function WordLookupPanel({ lookup, fallbackSentence = '' }: WordLookupPanelProps) {
  const [typed, setTyped] = useState('');
  const { resolution, target, loading, adding, error, history, pending } = lookup;

  function lookUpTyped() {
    const surface = typed.trim();
    if (surface === '') return;
    lookup.request({ surface, sentence: fallbackSentence });
    setTyped('');
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="text-ink-100 font-medium">Look up a word</h3>
        <p className="text-ink-500 mt-1 text-sm leading-relaxed">
          Tap any word in the passage, or select a phrase to look the whole thing up. You get the
          dictionary form, so an inflected word still files itself correctly.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <TextInput
          label="Or type one"
          placeholder="z. B. Regenbögen"
          value={typed}
          wrapperClassName="flex-1"
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') lookUpTyped();
          }}
        />
        <Button variant="ghost" onClick={lookUpTyped} disabled={typed.trim() === ''}>
          Look up
        </Button>
      </div>

      {loading && target && (
        <div className="flex items-center gap-3">
          <Spinner />
          <p className="text-ink-300 text-sm">
            Looking up <span className="font-reading">{target.surface}</span>…
          </p>
        </div>
      )}

      {!loading && error !== null && (
        <div className="flex flex-col gap-3">
          <InferenceErrorAlert error={error} />
          <div>
            <Button variant="secondary" onClick={lookup.retry}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {!loading && error === null && resolution && (
        <Resolved
          resolution={resolution}
          adding={adding}
          onAdd={() => {
            if (resolution.kind === 'new') lookup.add(resolution);
          }}
        />
      )}

      {history.length > 0 && (
        <div className="border-ink-800/70 flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-500 text-xs tracking-wide uppercase">
              Looked up in this passage
            </p>
            {pending.length > 0 && (
              <Button variant="ghost" onClick={lookup.addAll} disabled={adding}>
                Add all {pending.length}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {history.map((row) =>
              row.kind === 'known' ? (
                <VocabPill key={row.entry.id} entry={row.entry} />
              ) : (
                <span
                  key={row.target.surface}
                  className="border-ink-800 bg-ink-900/50 text-ink-400 inline-flex items-baseline gap-1.5 rounded-lg border border-dashed px-2.5 py-1 text-sm"
                >
                  <span className="font-reading">{lookupDisplay(row).form}</span>
                  <span className="text-ink-600 text-xs">not added</span>
                </span>
              ),
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
