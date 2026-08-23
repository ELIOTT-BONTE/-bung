import { describe, expect, it } from 'vitest';
import { SCHEMA_BY_INTENT } from '../responseSchemas';
import { PROMPT_INTENT } from '../prompts';
import { buildChatRequest } from './webllmRequest';

describe('buildChatRequest', () => {
  it('sends the prompt as a user turn', () => {
    const request = buildChatRequest('Schreibe einen Text.');

    expect(request.messages).toEqual([{ role: 'user', content: 'Schreibe einen Text.' }]);
    expect(request.stream).toBe(false);
  });

  it('puts the system prompt first when there is one', () => {
    const request = buildChatRequest('Schreibe einen Text.', { systemPrompt: 'Du bist Lehrer.' });

    expect(request.messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(request.messages[0].content).toBe('Du bist Lehrer.');
  });

  it('passes sampling options through under their OpenAI names', () => {
    const request = buildChatRequest('Hallo', { temperature: 0.2, maxTokens: 128 });

    expect(request.temperature).toBe(0.2);
    expect(request.max_tokens).toBe(128);
  });

  it('leaves sampling options unset rather than guessing defaults', () => {
    const request = buildChatRequest('Hallo');

    expect(request.temperature).toBeUndefined();
    expect(request.max_tokens).toBeUndefined();
  });

  it('is unconstrained when the call has no schema', () => {
    expect(buildChatRequest('Hallo').response_format).toBeUndefined();
  });

  it('serialises the schema, which is how WebLLM wants it', () => {
    const schema = SCHEMA_BY_INTENT[PROMPT_INTENT.sentenceEvaluation]!;

    const request = buildChatRequest('Hallo', { schema });

    expect(request.response_format?.type).toBe('json_object');
    expect(typeof request.response_format?.schema).toBe('string');
    expect(JSON.parse(request.response_format!.schema!)).toEqual(schema.schema);
  });
});
