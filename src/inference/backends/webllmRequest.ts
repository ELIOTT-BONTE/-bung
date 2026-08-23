/**
 * Prompt-to-request mapping for the WebGPU tier, kept separate from the engine
 * so it can be tested without a GPU. Nothing here touches the SDK at runtime;
 * the type import is erased at compile time.
 */

import type { ChatCompletionRequestNonStreaming } from '@mlc-ai/web-llm';
import type { InferenceOptions } from '../types';

/**
 * WebLLM takes the JSON Schema as a string, not an object, and requires
 * `json_object` as the type when one is supplied.
 */
export function buildChatRequest(
  prompt: string,
  options?: InferenceOptions,
): ChatCompletionRequestNonStreaming {
  const request: ChatCompletionRequestNonStreaming = {
    stream: false,
    messages: options?.systemPrompt
      ? [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: prompt },
        ]
      : [{ role: 'user', content: prompt }],
  };

  if (options?.temperature !== undefined) request.temperature = options.temperature;
  if (options?.maxTokens !== undefined) request.max_tokens = options.maxTokens;

  if (options?.schema) {
    request.response_format = {
      type: 'json_object',
      schema: JSON.stringify(options.schema.schema),
    };
  }

  return request;
}
