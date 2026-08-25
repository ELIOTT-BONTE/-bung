// @vitest-environment jsdom

/**
 * Covers the settings surface for the hosted chain: that a key typed here
 * reaches both storage and the inference layer, and that the chain display
 * tells the truth about which candidates will actually be tried.
 */

import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearApiKeys, hasApiKey, loadEnvKeys, API_KEY_ENV_VARS } from '../inference';
import { clearAllData, getSettings } from '../storage';
import { ApiKeyFields, ChainOrder } from './ProviderChain';
import { SettingsProvider } from './settings';

beforeEach(async () => {
  clearApiKeys();
  await clearAllData();
});

afterEach(cleanup);

function renderFields() {
  return render(
    <SettingsProvider>
      <ApiKeyFields />
    </SettingsProvider>,
  );
}

describe('ApiKeyFields', () => {
  it('offers a field for every provider, named by its model', async () => {
    renderFields();

    expect(await screen.findByLabelText('Mistral API key')).toBeTruthy();
    expect(screen.getByLabelText('Gemini Flash API key')).toBeTruthy();
    expect(screen.getByLabelText('Groq API key')).toBeTruthy();

    expect(screen.getByText('mistral-small-latest')).toBeTruthy();
    expect(screen.getByText('gemini-3.6-flash')).toBeTruthy();
    expect(screen.getByText('openai/gpt-oss-120b')).toBeTruthy();
  });

  it('shows every provider as skipped until a key exists', async () => {
    renderFields();

    await screen.findByLabelText('Mistral API key');
    expect(screen.getAllByText('skipped')).toHaveLength(3);
  });

  it('never renders a key as readable text', async () => {
    renderFields();

    const field = await screen.findByLabelText('Mistral API key');
    expect(field.getAttribute('type')).toBe('password');
  });

  it('saves a typed key on blur and hands it to the inference layer', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.type(await screen.findByLabelText('Mistral API key'), 'sk-test-12345');
    // Nothing is written while typing; the blur is what commits.
    expect(hasApiKey('mistral')).toBe(false);

    await user.tab();

    await waitFor(async () => {
      expect((await getSettings()).apiKeys.mistral).toBe('sk-test-12345');
    });
    expect(hasApiKey('mistral')).toBe(true);
    expect(await screen.findByText('key saved')).toBeTruthy();
  });

  it('drops the key again when the field is cleared', async () => {
    const user = userEvent.setup();
    renderFields();

    const field = await screen.findByLabelText('Mistral API key');
    await user.type(field, 'sk-test-12345');
    await user.tab();
    await screen.findByText('key saved');

    await user.clear(field);
    await user.tab();

    await waitFor(async () => {
      expect((await getSettings()).apiKeys.mistral).toBeUndefined();
    });
    expect(hasApiKey('mistral')).toBe(false);
  });

  it('says when a key came from the build environment instead', async () => {
    loadEnvKeys({ [API_KEY_ENV_VARS.groq]: 'gsk-from-env' });
    renderFields();

    expect(await screen.findByText(`from ${API_KEY_ENV_VARS.groq}`)).toBeTruthy();
    expect(screen.getAllByText('skipped')).toHaveLength(2);
  });
});

describe('ChainOrder', () => {
  it('lists the hosted providers first and the local engine last', () => {
    render(<ChainOrder localTier="wasm" />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Mistral'),
      expect.stringContaining('Gemini Flash'),
      expect.stringContaining('Groq'),
      expect.stringContaining('WASM (wllama)'),
    ]);
  });

  it('marks keyless providers as skipped, and never the local engine', () => {
    render(<ChainOrder localTier="mock" />);

    const items = screen.getAllByRole('listitem');
    for (const item of items.slice(0, 3)) {
      expect(within(item).getByText(/skipped, no key/)).toBeTruthy();
    }
    expect(items[3].textContent).not.toContain('skipped');
  });

  it('stops marking a provider as skipped once it has a key', () => {
    loadEnvKeys({ [API_KEY_ENV_VARS.mistral]: 'sk-from-env' });
    render(<ChainOrder localTier="mock" />);

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).not.toContain('skipped');
    expect(items[1].textContent).toContain('skipped');
  });

  it('names whichever local engine was chosen', () => {
    render(<ChainOrder localTier="webgpu" />);

    expect(screen.getAllByRole('listitem').at(-1)?.textContent).toContain('WebGPU (WebLLM)');
  });
});
