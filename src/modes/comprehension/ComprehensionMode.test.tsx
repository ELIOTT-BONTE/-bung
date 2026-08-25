// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveTier } from '../../inference';
import { clearAllData } from '../../storage';
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
});
