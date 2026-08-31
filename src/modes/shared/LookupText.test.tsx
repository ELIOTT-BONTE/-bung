// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LookupText } from './LookupText';

const TEXT = 'Heute war ich im Wald. Das Wetter war schön!';

beforeEach(() => {
  document.getSelection()?.removeAllRanges();
});

afterEach(cleanup);

function setup(onLookup = vi.fn()) {
  const { container } = render(<LookupText text={TEXT} onLookup={onLookup} />);
  const paragraph = container.querySelector('p');
  if (!paragraph) throw new Error('no paragraph rendered');

  const spans = Array.from(paragraph.querySelectorAll<HTMLElement>('[data-token-index]'));
  const spanFor = (token: string) => {
    const found = spans.find((span) => span.textContent === token);
    if (!found) throw new Error(`no span for ${token}`);
    return found;
  };

  return { onLookup, paragraph, spanFor };
}

/** Stands in for a drag: jsdom has the Selection API but no pointer to drive it. */
function select(from: HTMLElement, to: HTMLElement) {
  const range = document.createRange();
  range.setStart(from.firstChild as Node, 0);
  range.setEnd(to.firstChild as Node, (to.textContent ?? '').length);

  const selection = document.getSelection();
  if (!selection) throw new Error('no selection in this document');
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('LookupText', () => {
  it('looks up a tapped word with the sentence it came from', async () => {
    const user = userEvent.setup();
    const { onLookup, spanFor } = setup();

    await user.click(spanFor('Wetter'));

    expect(onLookup).toHaveBeenCalledTimes(1);
    expect(onLookup).toHaveBeenCalledWith({
      surface: 'Wetter',
      sentence: 'Das Wetter war schön!',
    });
  });

  it('ignores taps on whitespace and punctuation', async () => {
    const user = userEvent.setup();
    const { onLookup, spanFor } = setup();

    await user.click(spanFor('.'));
    await user.click(spanFor(' '));

    expect(onLookup).not.toHaveBeenCalled();
  });

  it('looks up a selected phrase as one target', () => {
    const { onLookup, paragraph, spanFor } = setup();

    select(spanFor('im'), spanFor('Wald'));
    fireEvent.mouseUp(paragraph);

    expect(onLookup).toHaveBeenCalledTimes(1);
    expect(onLookup).toHaveBeenCalledWith({
      surface: 'im Wald',
      sentence: 'Heute war ich im Wald.',
    });
  });

  it('trims a selection back to real words', () => {
    const { onLookup, paragraph, spanFor } = setup();

    // Dragging from the space before a word to the full stop after it, which is
    // what a real drag across "im Wald" tends to produce.
    select(spanFor(' '), spanFor('.'));
    fireEvent.mouseUp(paragraph);

    expect(onLookup).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'war ich im Wald' }),
    );
  });

  it('marks the looked-up words so the learner can see what the card is about', async () => {
    const user = userEvent.setup();
    const { spanFor } = setup();

    await user.click(spanFor('Wald'));

    expect(spanFor('Wald').className).toMatch(/bg-ember/);
    expect(spanFor('Wetter').className).not.toMatch(/bg-ember-500\/25/);
  });

  it('does nothing at all when disabled', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn();
    const { container } = render(<LookupText text={TEXT} onLookup={onLookup} disabled />);

    const span = Array.from(container.querySelectorAll<HTMLElement>('[data-token-index]')).find(
      (node) => node.textContent === 'Wetter',
    );
    await user.click(span as HTMLElement);

    expect(onLookup).not.toHaveBeenCalled();
  });
});
