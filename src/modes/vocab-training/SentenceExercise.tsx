import { useEffect, useState } from 'react';
import { formatVocabDisplay, type VocabEntry } from '../../storage';
import { Badge, Button, Spinner, TextArea } from '../../ui';

export interface SentenceExerciseProps {
  entry: VocabEntry;
  busy: boolean;
  onSubmit: (sentence: string) => void;
}

export function SentenceExercise({ entry, busy, onSubmit }: SentenceExerciseProps) {
  const [sentence, setSentence] = useState('');

  useEffect(() => setSentence(''), [entry.id]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Badge tone="accent">use it in a sentence</Badge>
        <p className="font-reading text-ink-100 text-3xl tracking-tight">
          {formatVocabDisplay(entry)}
        </p>
        {entry.definition && <p className="text-ink-500 text-sm">{entry.definition}</p>}
      </div>

      <TextArea
        label="Your sentence"
        reading
        rows={3}
        placeholder="Schreibe einen eigenen Satz…"
        value={sentence}
        disabled={busy}
        onChange={(event) => setSentence(event.target.value)}
        hint="Anything goes, as long as the word carries its real meaning."
      />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={busy || sentence.trim().split(/\s+/).length < 3}
          onClick={() => onSubmit(sentence.trim())}
        >
          {busy ? 'Checking…' : 'Check my sentence'}
        </Button>
        {busy && <Spinner />}
      </div>
    </div>
  );
}
