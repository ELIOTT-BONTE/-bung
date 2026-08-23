import { useEffect, useState } from 'react';
import { formatVocabDisplay, PART_OF_SPEECH_LABELS, type ReviewGrade, type VocabEntry } from '../../storage';
import { Badge, Button } from '../../ui';
import { FLASHCARD_GRADES } from './session';

export interface FlashcardProps {
  entry: VocabEntry;
  busy: boolean;
  onGrade: (grade: ReviewGrade) => void;
}

export function Flashcard({ entry, busy, onGrade }: FlashcardProps) {
  const [revealed, setRevealed] = useState(false);

  // A new card always starts face down, even if the component is reused.
  useEffect(() => setRevealed(false), [entry.id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Badge tone="neutral">{PART_OF_SPEECH_LABELS[entry.partOfSpeech]}</Badge>
        {/* Nouns are never shown bare: article and plural are part of the word. */}
        <p className="font-reading text-ink-100 text-3xl tracking-tight sm:text-4xl">
          {formatVocabDisplay(entry)}
        </p>
        {revealed ? (
          <p className="text-ember-200 mt-2 text-lg">{entry.definition || 'No definition saved yet'}</p>
        ) : (
          <p className="text-ink-600 mt-2 text-sm">What does it mean?</p>
        )}
      </div>

      {!revealed ? (
        <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
          Show meaning
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-ink-500 text-center text-xs">How well did you recall it?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FLASHCARD_GRADES.map((option) => (
              <Button
                key={option.grade}
                variant={option.grade >= 4 ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => onGrade(option.grade)}
                className="h-auto flex-col py-2.5"
              >
                <span>{option.label}</span>
                <span className="text-[0.7rem] font-normal opacity-70">{option.hint}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
