/**
 * Text a learner can interrogate: tap one word, or select a phrase.
 *
 * Both gestures land in the same `mouseup` handler rather than being split
 * between `click` and a selection listener, because a drag fires both and the
 * word under the cursor would otherwise be looked up on top of the phrase the
 * learner actually highlighted.
 *
 * Every token gets a span, whitespace included. That is what makes selections
 * reliable: a drag usually ends in the space after a word, and if only words
 * carried indices there would be nothing to map that endpoint back to.
 *
 * Deliberately not focusable. Making several hundred words tab stops would
 * wreck the tab order and make screen readers announce a paragraph as a wall of
 * buttons; the panel carries a text input as the keyboard path instead.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { isWordToken, sentenceAround, tokenizeWords } from '../../text';
import { cn } from '../../ui';
import type { LookupTarget } from './wordLookup';

/** A selection wider than this is a reading gesture, not a lookup. */
const MAX_SELECTED_TOKENS = 40;

type TokenRange = [number, number];

/** Walks up from whatever the DOM reported to the token span containing it. */
function tokenIndexFrom(node: Node | null, container: HTMLElement): number | null {
  let current: Node | null = node;

  while (current && current !== container) {
    if (current instanceof HTMLElement && current.dataset.tokenIndex !== undefined) {
      const index = Number.parseInt(current.dataset.tokenIndex, 10);
      return Number.isNaN(index) ? null : index;
    }
    current = current.parentNode;
  }

  return null;
}

/** Pulls the edges of a range in to real words, dropping trailing punctuation. */
function trimToWordTokens(
  tokens: readonly string[],
  from: number,
  to: number,
): TokenRange | null {
  let start = from;
  let end = to;

  while (start <= end && !isWordToken(tokens[start])) start += 1;
  while (end >= start && !isWordToken(tokens[end])) end -= 1;

  return start <= end ? [start, end] : null;
}

function readSelectedRange(
  container: HTMLElement,
  tokens: readonly string[],
): TokenRange | null {
  const selection = container.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const from = tokenIndexFrom(range.startContainer, container);
  const to = tokenIndexFrom(range.endContainer, container);
  if (from === null || to === null) return null;

  const low = Math.min(from, to);
  const high = Math.max(from, to);
  if (high - low > MAX_SELECTED_TOKENS) return null;

  return trimToWordTokens(tokens, low, high);
}

export interface LookupTextProps {
  text: string;
  onLookup: (target: LookupTarget) => void;
  disabled?: boolean;
  className?: string;
}

export function LookupText({ text, onLookup, disabled = false, className }: LookupTextProps) {
  const containerRef = useRef<HTMLParagraphElement>(null);
  const [active, setActive] = useState<TokenRange | null>(null);
  const tokens = useMemo(() => tokenizeWords(text), [text]);

  useEffect(() => {
    setActive(null);
  }, [text]);

  function fire(range: TokenRange) {
    const [from, to] = range;
    setActive(range);
    onLookup({
      surface: tokens
        .slice(from, to + 1)
        .join('')
        .trim(),
      sentence: sentenceAround(tokens, from, to),
    });
  }

  function handleMouseUp(event: React.MouseEvent<HTMLParagraphElement>) {
    const container = containerRef.current;
    if (disabled || !container) return;

    const selected = readSelectedRange(container, tokens);
    if (selected) {
      fire(selected);
      return;
    }

    const index = tokenIndexFrom(event.target as Node, container);
    if (index === null || !isWordToken(tokens[index])) return;
    fire([index, index]);
  }

  return (
    <p
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className={cn(
        'font-reading text-ink-100 text-[1.12rem] leading-[1.85] whitespace-pre-wrap',
        className,
      )}
    >
      {tokens.map((token, index) => {
        const word = isWordToken(token);
        const highlighted = active !== null && index >= active[0] && index <= active[1];

        return (
          <span
            key={index}
            data-token-index={index}
            data-lookup-word={word ? '' : undefined}
            className={cn(
              word && !disabled && 'cursor-pointer rounded-[3px] hover:bg-ember-500/15',
              highlighted && 'bg-ember-500/25 text-ember-100 rounded-[3px]',
            )}
          >
            {token}
          </span>
        );
      })}
    </p>
  );
}
