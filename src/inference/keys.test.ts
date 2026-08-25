import { afterEach, describe, expect, it } from 'vitest';
import {
  API_KEY_ENV_VARS,
  apiKeySource,
  clearApiKeys,
  hasApiKey,
  loadEnvKeys,
  resolveApiKey,
  setSettingsKeys,
} from './keys';

afterEach(() => {
  clearApiKeys();
});

describe('resolveApiKey', () => {
  it('has nothing before anything is configured', () => {
    expect(resolveApiKey('mistral')).toBeNull();
    expect(hasApiKey('mistral')).toBe(false);
    expect(apiKeySource('mistral')).toBeNull();
  });

  it('reads keys the user saved in settings', () => {
    setSettingsKeys({ mistral: 'from-settings' });

    expect(resolveApiKey('mistral')).toBe('from-settings');
    expect(apiKeySource('mistral')).toBe('settings');
  });

  it('reads build-time keys once the env is loaded explicitly', () => {
    loadEnvKeys({ [API_KEY_ENV_VARS.groq]: 'from-env' });

    expect(resolveApiKey('groq')).toBe('from-env');
    expect(apiKeySource('groq')).toBe('env');
  });

  it('lets a key typed in settings override the build-time one', () => {
    loadEnvKeys({ [API_KEY_ENV_VARS.gemini]: 'from-env' });
    setSettingsKeys({ gemini: 'from-settings' });

    expect(resolveApiKey('gemini')).toBe('from-settings');
    expect(apiKeySource('gemini')).toBe('settings');
  });

  it('falls back to the build-time key when the settings field is cleared', () => {
    loadEnvKeys({ [API_KEY_ENV_VARS.gemini]: 'from-env' });
    setSettingsKeys({ gemini: 'from-settings' });
    setSettingsKeys({ gemini: '' });

    expect(resolveApiKey('gemini')).toBe('from-env');
    expect(apiKeySource('gemini')).toBe('env');
  });

  it('replaces stored keys wholesale, so removing an entry removes the key', () => {
    setSettingsKeys({ mistral: 'a', groq: 'b' });
    setSettingsKeys({ groq: 'b' });

    expect(resolveApiKey('mistral')).toBeNull();
    expect(resolveApiKey('groq')).toBe('b');
  });

  it('treats blank and whitespace-only keys as absent', () => {
    setSettingsKeys({ mistral: '   ', gemini: '' });
    loadEnvKeys({ [API_KEY_ENV_VARS.groq]: '  ' });

    expect(hasApiKey('mistral')).toBe(false);
    expect(hasApiKey('gemini')).toBe(false);
    expect(hasApiKey('groq')).toBe(false);
  });

  it('trims surrounding whitespace, which a paste from a console tends to add', () => {
    setSettingsKeys({ mistral: '  sk-test\n' });

    expect(resolveApiKey('mistral')).toBe('sk-test');
  });

  it('ignores keys for anything that is not a hosted provider', () => {
    setSettingsKeys({ webgpu: 'nonsense', openai: 'nonsense' });

    expect(resolveApiKey('mistral')).toBeNull();
  });

  it('tolerates a settings record that has never been written', () => {
    expect(() => setSettingsKeys(undefined)).not.toThrow();
    expect(hasApiKey('mistral')).toBe(false);
  });
});

describe('env var names', () => {
  it('are the VITE_-prefixed names Vite will inline', () => {
    expect(API_KEY_ENV_VARS).toEqual({
      mistral: 'VITE_MISTRAL_API_KEY',
      gemini: 'VITE_GEMINI_API_KEY',
      groq: 'VITE_GROQ_API_KEY',
    });
  });
});
