// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveTier } from '../../inference';
import { clearAllData, listVocab } from '../../storage';
import { ComprehensionMode } from './ComprehensionMode';
import * as pipeline from './pipeline';

beforeEach(async () => {
  setActiveTier('mock');
  await clearAllData();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('ComprehensionMode', () => {
  it('offers CEFR and length before generating', () => {
    render(<ComprehensionMode />);

    expect(screen.getByText('Level')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'C2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Long · ~220 words/ })).toBeTruthy();
  });

  it('lets a length be typed in, and will not generate until it is usable', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(pipeline, 'generatePassage');

    render(<ComprehensionMode />);
    await user.click(screen.getByRole('button', { name: /Custom/ }));

    const field = screen.getByLabelText('Words');
    const generate = screen.getByRole('button', { name: /Generate passage/ });

    // Empty is not yet an answer, and out of range is a rejected one.
    expect(generate).toHaveProperty('disabled', true);
    await user.type(field, '4000');
    expect(screen.getByText(/400 words is the most/)).toBeTruthy();
    expect(generate).toHaveProperty('disabled', true);

    await user.clear(field);
    await user.type(field, '175');
    expect(generate).toHaveProperty('disabled', false);

    await user.click(generate);

    expect(spy).toHaveBeenCalledWith('', expect.objectContaining({ approximateWords: 175 }));
    expect(await screen.findByText('~175 words')).toBeTruthy();
  });

  it('shows the passage as soon as it exists, before questions finish', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const realPrepare = pipeline.prepareStudyMaterial;
    vi.spyOn(pipeline, 'prepareStudyMaterial').mockImplementation(async (passage, options) => {
      await held;
      return realPrepare(passage, options);
    });

    render(<ComprehensionMode />);
    await user.click(screen.getByRole('button', { name: 'Reisen' }));
    await user.click(screen.getByRole('button', { name: /Generate passage/ }));

    expect(await screen.findByText(/Passage: Reisen/)).toBeTruthy();
    expect(screen.getByText(/you can start reading in the meantime/i)).toBeTruthy();
    expect(screen.queryByText('Answer in German')).toBeNull();

    release();

    await waitFor(() => {
      expect(screen.getByText('Answer in German')).toBeTruthy();
    });
    expect(screen.queryByText(/you can start reading in the meantime/i)).toBeNull();
  });

  it('offers a flagged word rather than saving it, and only saves on Add', async () => {
    const user = userEvent.setup();
    render(<ComprehensionMode />);

    await user.click(screen.getByRole('button', { name: 'Reisen' }));
    await user.click(screen.getByRole('button', { name: /Generate passage/ }));
    await screen.findByText('Answer in German');

    // Flagging "Zug" as key vocabulary must not have stored it.
    expect(await listVocab()).toHaveLength(0);

    // Every token is its own span, which is what makes one word tappable. This
    // word is flagged, so it resolves from the passage without a model call.
    await user.click(screen.getAllByText('Zug')[0]);

    const add = await screen.findByRole('button', { name: /Add to vocabulary/ });
    expect(await listVocab()).toHaveLength(0);

    await user.click(add);

    await waitFor(() => {
      expect(screen.getByText(/Already in your vocabulary/)).toBeTruthy();
    });
    expect((await listVocab()).map((entry) => entry.term)).toEqual(['Zug']);
  });

  it('resolves a typed inflected form and adds the dictionary form', async () => {
    const user = userEvent.setup();
    render(<ComprehensionMode />);

    await user.click(screen.getByRole('button', { name: 'Reisen' }));
    await user.click(screen.getByRole('button', { name: /Generate passage/ }));
    await screen.findByText('Answer in German');

    // Not in this passage at all, which is half the point of the text input.
    await user.type(screen.getByLabelText('Or type one'), 'Küchen');
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    // The card and the list of this passage's lookups both show the word, so
    // there is deliberately more than one match here.
    const shown = await screen.findAllByText('die Küche, -n', {}, { timeout: 5000 });
    expect(shown.length).toBeGreaterThan(0);
    expect(screen.getByText('kitchen')).toBeTruthy();
    expect(screen.getByText(/form of die Küche/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Add to vocabulary/ }));

    await waitFor(() => {
      expect(screen.getByText(/Already in your vocabulary/)).toBeTruthy();
    });
  }, 20000);
});
