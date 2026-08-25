/**
 * End-to-end cover for the hosted path: the real `generateText`, the real
 * chain, the real backends, the real transport and the real request builders,
 * with only `fetch` itself stubbed.
 *
 * The unit tests around these pieces can all pass while the wiring between them
 * is wrong, which is exactly the bug a live key would find and nothing else
 * would.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText, getBackend, setActiveTier } from './index';
import { clearApiKeys, setSettingsKeys } from './keys';
import { buildPassagePrompt, buildSentenceEvaluationPrompt } from './prompts';
import { parseSentenceEvaluation } from './schemas';
import { isHostedProviderError, type HostedProviderError } from './types';

const passagePrompt = buildPassagePrompt({
  theme: 'Bahnhof',
  knownTerms: [],
  newWordBudget: 4,
  approximateWords: 80,
  level: 'A2',
});

const sentencePrompt = buildSentenceEvaluationPrompt({
  term: 'Bahnhof',
  displayForm: 'der Bahnhof, Bahnhöfe',
  definition: 'railway station',
  sentence: 'Ich warte am Bahnhof auf den Zug.',
});

function openAiReply(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

function geminiReply(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });
}

function rateLimited(): Response {
  return new Response(JSON.stringify({ error: { message: 'rate limit exceeded' } }), {
    status: 429,
  });
}

/** Routes by hostname, the way the real providers would be told apart. */
function router(handlers: Record<string, () => Response>) {
  return vi.fn((url: string | URL | Request, _init?: RequestInit) => {
    const href = String(url);
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (href.includes(fragment)) return Promise.resolve(handler());
    }
    throw new Error(`Unexpected request to ${href}`);
  });
}

beforeEach(() => {
  clearApiKeys();
  setActiveTier('mock');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiKeys();
});

describe('generateText over hosted providers', () => {
  it('answers from Mistral when it has a key', async () => {
    setSettingsKeys({ mistral: 'sk-test' });
    const fetchImpl = router({ 'api.mistral.ai': () => openAiReply('Der Bahnhof ist groß.') });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(generateText(passagePrompt)).resolves.toBe('Der Bahnhof ist groß.');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('sends the tutor system prompt and the app\u2019s sampling defaults', async () => {
    setSettingsKeys({ mistral: 'sk-test' });
    const fetchImpl = router({ 'api.mistral.ai': () => openAiReply('Der Bahnhof ist groß.') });
    vi.stubGlobal('fetch', fetchImpl);

    await generateText(passagePrompt);

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.model).toBe('mistral-small-latest');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('German');
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(640);
  });

  it('constrains the reply for a prompt that needs JSON, and parses it', async () => {
    setSettingsKeys({ mistral: 'sk-test' });
    const fetchImpl = router({
      'api.mistral.ai': () =>
        openAiReply('{"correct":true,"grade":4,"feedback":"Good use of the word."}'),
    });
    vi.stubGlobal('fetch', fetchImpl);

    const raw = await generateText(sentencePrompt);
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));

    expect(body.response_format.json_schema.name).toBe('sentence_evaluation');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(parseSentenceEvaluation(raw)).toMatchObject({ correct: true, grade: 4 });
  });

  it('falls through to Gemini when Mistral is rate limited', async () => {
    setSettingsKeys({ mistral: 'sk-test', gemini: 'AIza-test' });
    const fetchImpl = router({
      'api.mistral.ai': rateLimited,
      'generativelanguage.googleapis.com': () => geminiReply('Der Zug kommt später.'),
    });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(generateText(passagePrompt)).resolves.toBe('Der Zug kommt später.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('skips a keyless provider without any request at all', async () => {
    setSettingsKeys({ groq: 'gsk-test' });
    const fetchImpl = router({ 'api.groq.com': () => openAiReply('Der Bahnhof ist alt.') });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(generateText(passagePrompt)).resolves.toBe('Der Bahnhof ist alt.');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toContain('api.groq.com');
  });

  it('reaches the local engine when every provider declines', async () => {
    setSettingsKeys({ mistral: 'sk-test', gemini: 'AIza-test', groq: 'gsk-test' });
    const fetchImpl = router({
      'api.mistral.ai': rateLimited,
      'generativelanguage.googleapis.com': rateLimited,
      'api.groq.com': rateLimited,
    });
    vi.stubGlobal('fetch', fetchImpl);

    // The mock tier stands in for a real local engine here; what matters is that
    // the chain got past three hosted failures to reach it.
    await expect(generateText(passagePrompt)).resolves.toContain('Bahnhof');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('makes no network call at all when no key is configured', async () => {
    const fetchImpl = router({});
    vi.stubGlobal('fetch', fetchImpl);

    await expect(generateText(passagePrompt)).resolves.toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('survives a rejected key by falling through rather than failing the call', async () => {
    setSettingsKeys({ gemini: 'AIza-wrong' });
    const fetchImpl = router({
      'generativelanguage.googleapis.com': () =>
        new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }),
    });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(generateText(passagePrompt)).resolves.toContain('Bahnhof');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('carries the provider\u2019s own explanation into the error it throws', async () => {
    setSettingsKeys({ gemini: 'AIza-wrong' });
    vi.stubGlobal(
      'fetch',
      router({
        'generativelanguage.googleapis.com': () =>
          new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }),
      }),
    );

    const error = await getBackend('gemini')
      .generate(passagePrompt)
      .catch((caught: unknown) => caught);

    expect(isHostedProviderError(error)).toBe(true);
    expect((error as HostedProviderError).status).toBe(400);
    expect((error as HostedProviderError).retryable).toBe(false);
    expect((error as Error).message).toContain('API key not valid');
  });
});
