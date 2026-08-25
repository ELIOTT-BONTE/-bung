/**
 * Wire formats for the three hosted providers, kept separate from the transport
 * so every byte we send can be asserted in a test without a network or a key.
 *
 * Two deliberate constraints run through this file:
 *
 *   - No vendor SDK. Mistral's CORS preflight rejects the OpenAI SDK's
 *     `x-stainless-*` headers and Groq's SDK refuses to run in a browser at
 *     all, so requests are hand-built and carry only headers the preflight
 *     allowlists accept.
 *   - Gemini uses the legacy `models/...:generateContent` path rather than the
 *     newer `/v1beta/interactions` API, whose `Api-Revision` header fails CORS
 *     preflight and makes it unusable from a browser entirely.
 */

import { ModelOutputError } from '../parse';
import type { HostedProviderId, InferenceOptions, JsonSchema, ResponseSchema } from '../types';

/** One provider-neutral HTTP call, ready to hand to `fetch`. */
export interface HostedRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Reasoning models spend tokens before they emit any answer, and that spend
 * counts against the completion limit. Without this allowance a 640-token
 * budget can be exhausted by reasoning alone and come back empty.
 */
const REASONING_TOKEN_ALLOWANCE = 512;

type JsonRecord = Record<string, unknown>;

/**
 * OpenAI-style strict mode enforces two things beyond our own schemas:
 * `additionalProperties: false` on every object, and a `required` list naming
 * every property. Ours already satisfy both, but a schema the provider rejects
 * costs us constrained output silently, so it is normalised rather than
 * trusted.
 */
export function toStrictJsonSchema(schema: JsonSchema): JsonSchema {
  if (schema.type === 'array') {
    return { ...schema, items: toStrictJsonSchema(schema.items) };
  }

  if (schema.type === 'object') {
    const properties: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = toStrictJsonSchema(value);
    }
    return {
      ...schema,
      properties,
      required: Object.keys(schema.properties),
      additionalProperties: false,
    };
  }

  return schema;
}

/**
 * Gemini's `responseSchema` takes an OpenAPI-flavoured subset rather than full
 * JSON Schema: `additionalProperties` is not part of it, and key order is only
 * honoured when stated explicitly through `propertyOrdering`.
 */
export function toGeminiSchema(schema: JsonSchema): JsonRecord {
  if (schema.type === 'array') {
    const { items, ...rest } = schema;
    return { ...rest, items: toGeminiSchema(items) };
  }

  if (schema.type === 'object') {
    const { properties, additionalProperties: _additionalProperties, ...rest } = schema;
    const keys = Object.keys(properties);
    const mapped: JsonRecord = {};
    for (const key of keys) mapped[key] = toGeminiSchema(properties[key]);
    return {
      ...rest,
      properties: mapped,
      required: rest.required ? [...rest.required] : keys,
      propertyOrdering: keys,
    };
  }

  return { ...schema };
}

function chatMessages(prompt: string, systemPrompt?: string) {
  return systemPrompt
    ? [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];
}

function strictResponseFormat(schema: ResponseSchema): JsonRecord {
  return {
    type: 'json_schema',
    json_schema: {
      name: schema.name,
      schema: toStrictJsonSchema(schema.schema),
      strict: true,
    },
  };
}

export function buildMistralRequest(
  model: string,
  apiKey: string,
  prompt: string,
  options?: InferenceOptions,
): HostedRequest {
  const body: JsonRecord = {
    model,
    messages: chatMessages(prompt, options?.systemPrompt),
  };

  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options?.schema) body.response_format = strictResponseFormat(options.schema);

  return {
    url: MISTRAL_ENDPOINT,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body,
  };
}

export function buildGroqRequest(
  model: string,
  apiKey: string,
  prompt: string,
  options?: InferenceOptions,
): HostedRequest {
  const body: JsonRecord = {
    model,
    messages: chatMessages(prompt, options?.systemPrompt),
    // gpt-oss is a reasoning model. Hiding the reasoning keeps `content` to the
    // answer alone, so the existing tolerant parsers see what they expect, and
    // the low effort setting keeps a free-tier call from taking half a minute.
    reasoning_format: 'hidden',
    reasoning_effort: 'low',
  };

  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) {
    body.max_completion_tokens = options.maxTokens + REASONING_TOKEN_ALLOWANCE;
  }
  if (options?.schema) body.response_format = strictResponseFormat(options.schema);

  return {
    url: GROQ_ENDPOINT,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body,
  };
}

export function buildGeminiRequest(
  model: string,
  apiKey: string,
  prompt: string,
  options?: InferenceOptions,
): HostedRequest {
  const generationConfig: JsonRecord = {};
  if (options?.temperature !== undefined) generationConfig.temperature = options.temperature;
  if (options?.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
  if (options?.schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = toGeminiSchema(options.schema.schema);
  }

  const body: JsonRecord = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };

  if (options?.systemPrompt) {
    body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
  }
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

  return {
    // The key travels as a header, never in the query string, so it stays out
    // of proxy logs and browser history.
    url: `${GEMINI_BASE_URL}/${model}:generateContent`,
    headers: {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
    },
    body,
  };
}

function fail(provider: HostedProviderId, reason: string, payload: unknown): never {
  throw new ModelOutputError(`${provider} returned ${reason}`, JSON.stringify(payload));
}

/** Reads the reply out of an OpenAI-shaped response (Mistral and Groq). */
export function readOpenAiReply(provider: HostedProviderId, payload: unknown): string {
  const choice = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content !== 'string' || content.trim() === '') {
    fail(provider, 'no message content', payload);
  }

  return content;
}

/**
 * Reads the reply out of a `generateContent` response. Gemini splits an answer
 * across parts, and returns a candidate with no parts at all when it stops for
 * length or safety — which has to read as a failure, not as an empty answer.
 */
export function readGeminiReply(payload: unknown): string {
  const candidate = (
    payload as {
      candidates?: { content?: { parts?: { text?: unknown }[] }; finishReason?: string }[];
    }
  )?.candidates?.[0];

  const text = (candidate?.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');

  if (text.trim() === '') {
    fail('gemini', `no text (finishReason: ${candidate?.finishReason ?? 'none'})`, payload);
  }

  return text;
}
