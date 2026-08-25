// @vitest-environment jsdom

/**
 * Mount smoke test: the first-run screen appears, choosing a tier persists and
 * drops the learner into the shell, and each mode screen renders.
 */

import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { clearAllData, getSettings } from './storage';

beforeEach(async () => {
  window.location.hash = '#/';
  await clearAllData();
});

afterEach(cleanup);

describe('App', () => {
  it('shows the first-run explanation before anything else', async () => {
    render(<App />);

    expect(await screen.findByText(/Everything happens in this browser/i)).toBeTruthy();
    expect(screen.getByText(/No server, no account/i)).toBeTruthy();
    // The mock tier is always offered; the real tiers are labelled by engine.
    expect(screen.getByText('Mock (dev)')).toBeTruthy();
    expect(screen.getByText('WASM (wllama)')).toBeTruthy();
  });

  it('remembers the chosen tier and opens the shell', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('radio', { name: /Mock \(dev\)/ }));
    await user.click(screen.getByRole('button', { name: /Start learning/i }));

    expect(await screen.findByRole('link', { name: 'Overview' })).toBeTruthy();
    await waitFor(async () => {
      const settings = await getSettings();
      expect(settings.firstRunCompleted).toBe(true);
      expect(settings.activeTier).toBe('mock');
    });
  });

  it('renders each mode screen', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Start learning/i }));
    await screen.findByRole('link', { name: 'Overview' });

    await user.click(screen.getByRole('link', { name: 'Reading' }));
    expect(await screen.findByText(/Pick a theme/i)).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'Journal' }));
    expect(await screen.findByText(/Today's entry/i)).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'Vocabulary' }));
    expect(await screen.findByText(/Nothing is due right now/i)).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    expect(await screen.findByText(/Hosted providers/i)).toBeTruthy();
    expect(screen.getByText(/Local engine/i)).toBeTruthy();
  });
});
