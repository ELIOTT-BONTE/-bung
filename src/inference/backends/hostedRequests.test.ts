import { describe, expect, it } from 'vitest';
import { ModelOutputError } from '../parse';
import { PROMPT_INTENT } from '../prompts';
import { SCHEMA_BY_INTENT } from '../responseSchemas';
import type { JsonSchema } from '../types';
import {
  buildGeminiRequest,
  buildGroqRequest,
  buildMistralRequest,
  readGeminiReply,
  readOpenAiReply,
  toGeminiSchema,
  toStrictJsonSchema,
} from './hostedRequests';

const schema = SCHEMA_BY_INTENT[PROMPT_INTENT.sentenceEvaluation]!;
const nestedSchema = SCHEMA_BY_INTENT[PROMPT_INTENT.questionsAndVocab]!;

const everySchema = Object.values(SCHEMA_BY_INTENT).filter((entry) => entry !== undefined);

/** Every object node in a schema tree, so invariants can be asserted on all of them. */
function objectNodes(node: unknown): Record<string, unknown>[] {
  if (typeof node !== 'object' || node === null) return [];
  const record = node as Record<string, unknown>;
  const found: Record<string, unknown>[] = [];

  if (record.type === 'object') found.push(record);
  if (record.type === 'array') found.push(...objectNodes(record.items));
  if (record.properties) {
    for (const value of Object.values(record.properties as Record<string, unknown>)) {
      found.push(...objectNodes(value));
    }
  }

  return found;
}

describe('toStrictJsonSchema', () => {
  it('closes every object, at every depth', () => {
    for (const entry of everySchema) {
      const nodes = objectNodes(toStrictJsonSchema(entry.schema));
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) expect(node.additionalProperties).toBe(false);
    }
  });

  it('requires every property, which is what strict mode means', () => {
    for (const entry of everySchema) {
      for (const node of objectNodes(toStrictJsonSchema(entry.schema))) {
        expect(node.required).toEqual(Object.keys(node.properties as Record<string, unknown>));
      }
    }
  });

  it('keeps the field constraints the prompts rely on', () => {
    const strict = toStrictJsonSchema(schema.schema) as Extract<JsonSchema, { type: 'object' }>;

    expect(strict.properties.grade).toEqual({ type: 'integer', minimum: 0, maximum: 5 });
  });
});

describe('toGeminiSchema', () => {
  it('drops additionalProperties, which is not in Gemini\u2019s schema subset', () => {
    for (const entry of everySchema) {
      for (const node of objectNodes(toGeminiSchema(entry.schema))) {
        expect(node).not.toHaveProperty('additionalProperties');
      }
    }
  });

  it('states key order explicitly, since Gemini only honours it when told', () => {
    const converted = toGeminiSchema(nestedSchema.schema);

    expect(converted.propertyOrdering).toEqual(['questions', 'vocab']);

    const vocabItems = (converted.properties as Record<string, Record<string, unknown>>).vocab
      .items as Record<string, unknown>;
    expect(vocabItems.propertyOrdering).toEqual([
      'term',
      'partOfSpeech',
      'determiner',
      'pluralForm',
      'definition',
    ]);
  });

  it('preserves enums and descriptions', () => {
    const converted = toGeminiSchema(nestedSchema.schema);
    const vocabItems = (converted.properties as Record<string, Record<string, unknown>>).vocab
      .items as Record<string, Record<string, Record<string, unknown>>>;

    expect(vocabItems.properties.partOfSpeech.enum).toEqual([
      'noun',
      'verb',
      'adjective',
      'adverb',
      'phrase',
      'other',
    ]);
    expect(vocabItems.properties.definition.description).toBe('Short English gloss');
  });
});

describe('buildMistralRequest', () => {
  it('posts to the chat completions endpoint with a bearer key', () => {
    const request = buildMistralRequest('mistral-small-latest', 'sk-test', 'Hallo');

    expect(request.url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer sk-test');
  });

  it('sends only headers the CORS preflight allowlist accepts', () => {
    const request = buildMistralRequest('mistral-small-latest', 'sk-test', 'Hallo');

    expect(Object.keys(request.headers).sort()).toEqual(['authorization', 'content-type']);
  });

  it('puts the system prompt first when there is one', () => {
    const request = buildMistralRequest('mistral-small-latest', 'sk-test', 'Hallo', {
      systemPrompt: 'Du bist Lehrer.',
    });

    expect(request.body).toMatchObject({
      messages: [
        { role: 'system', content: 'Du bist Lehrer.' },
        { role: 'user', content: 'Hallo' },
      ],
    });
  });

  it('passes sampling options through under their OpenAI names', () => {
    const request = buildMistralRequest('mistral-small-latest', 'sk-test', 'Hallo', {
      temperature: 0.2,
      maxTokens: 128,
    });

    expect(request.body).toMatchObject({ temperature: 0.2, max_tokens: 128 });
  });

  it('asks for strict schema mode rather than bare JSON mode', () => {
    const request = buildMistralRequest('mistral-small-latest', 'sk-test', 'Hallo', { schema });
    const body = request.body as Record<string, Record<string, Record<string, unknown>>>;

    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('sentence_evaluation');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('is unconstrained when the call has no schema', () => {
    const request = buildMistralRequest('mistral-small-latest', 'sk-test', 'Hallo');

    expect(request.body).not.toHaveProperty('response_format');
  });
});

describe('buildGroqRequest', () => {
  it('posts to the OpenAI-compatible endpoint with a bearer key', () => {
    const request = buildGroqRequest('openai/gpt-oss-120b', 'gsk-test', 'Hallo');

    expect(request.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer gsk-test');
  });

  it('hides reasoning so the answer arrives alone in content', () => {
    const request = buildGroqRequest('openai/gpt-oss-120b', 'gsk-test', 'Hallo');

    expect(request.body).toMatchObject({ reasoning_format: 'hidden', reasoning_effort: 'low' });
  });

  it('budgets extra tokens for reasoning on top of the answer', () => {
    const request = buildGroqRequest('openai/gpt-oss-120b', 'gsk-test', 'Hallo', {
      maxTokens: 640,
    });

    expect((request.body as Record<string, unknown>).max_completion_tokens).toBe(640 + 512);
    expect(request.body).not.toHaveProperty('max_tokens');
  });

  it('asks for strict schema mode', () => {
    const request = buildGroqRequest('openai/gpt-oss-120b', 'gsk-test', 'Hallo', { schema });
    const body = request.body as Record<string, Record<string, unknown>>;

    expect(body.response_format.type).toBe('json_schema');
  });
});

describe('buildGeminiRequest', () => {
  it('uses the legacy generateContent path, which is the browser-reachable one', () => {
    const request = buildGeminiRequest('gemini-3.6-flash', 'AIza-test', 'Hallo');

    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    );
    expect(request.url).not.toContain('interactions');
  });

  it('carries the key in a header, never in the query string', () => {
    const request = buildGeminiRequest('gemini-3.6-flash', 'AIza-test', 'Hallo');

    expect(request.headers['x-goog-api-key']).toBe('AIza-test');
    expect(request.url).not.toContain('AIza-test');
  });

  it('sends only headers the CORS preflight allowlist accepts', () => {
    const request = buildGeminiRequest('gemini-3.6-flash', 'AIza-test', 'Hallo');

    expect(Object.keys(request.headers).sort()).toEqual(['content-type', 'x-goog-api-key']);
  });

  it('sends the system prompt as a system instruction, not a turn', () => {
    const request = buildGeminiRequest('gemini-3.6-flash', 'AIza-test', 'Hallo', {
      systemPrompt: 'Du bist Lehrer.',
    });

    expect(request.body).toMatchObject({
      systemInstruction: { parts: [{ text: 'Du bist Lehrer.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Hallo' }] }],
    });
  });

  it('passes sampling options through under their Gemini names', () => {
    const request = buildGeminiRequest('gemini-3.6-flash', 'AIza-test', 'Hallo', {
      temperature: 0.2,
      maxTokens: 128,
    });

    expect(request.body).toMatchObject({
      generationConfig: { temperature: 0.2, maxOutputTokens: 128 },
    });
  });

  it('asks for JSON with a schema', () => {
    const request = buildGeminiRequest('gemini-3.6-flash', 'AIza-test', 'Hallo', { schema });
    const config = (request.body as Record<string, Record<string, unknown>>).generationConfig;

    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseSchema).toMatchObject({ type: 'object' });
  });

  it('omits generationConfig entirely when there is nothing to configure', () => {
    const request = buildGeminiRequest('gemini-3.6-flash', 'AIza-test', 'Hallo');

    expect(request.body).not.toHaveProperty('generationConfig');
  });
});

describe('readOpenAiReply', () => {
  it('returns the first choice\u2019s content', () => {
    const reply = readOpenAiReply('mistral', {
      choices: [{ message: { content: 'Guten Tag' } }],
    });

    expect(reply).toBe('Guten Tag');
  });

  it.each([
    ['an empty choice list', { choices: [] }],
    ['a blank message', { choices: [{ message: { content: '   ' } }] }],
    ['a missing message', { choices: [{}] }],
    ['an unexpected payload', { error: 'nope' }],
  ])('treats %s as unusable output', (_label, payload) => {
    expect(() => readOpenAiReply('groq', payload)).toThrow(ModelOutputError);
  });
});

describe('readGeminiReply', () => {
  it('joins the parts of the first candidate', () => {
    const reply = readGeminiReply({
      candidates: [{ content: { parts: [{ text: 'Guten ' }, { text: 'Tag' }] } }],
    });

    expect(reply).toBe('Guten Tag');
  });

  it('treats a candidate with no parts as a failure, not an empty answer', () => {
    expect(() => readGeminiReply({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toThrow(
      ModelOutputError,
    );
  });

  it('names the finish reason so a truncation is not mistaken for a bug', () => {
    expect(() => readGeminiReply({ candidates: [{ finishReason: 'SAFETY' }] })).toThrow(/SAFETY/);
  });
});
