/**
 * Groq free tier, the last link before falling back to the local model.
 *
 * Runs `openai/gpt-oss-120b`, not `llama-3.3-70b-versatile`: Groq shut that
 * model down on 16 August 2026 and names gpt-oss-120b as its replacement. That
 * is the better fit here anyway, because it is one of the few Groq models that
 * supports strict `json_schema` output, which five of this app's seven prompts
 * depend on.
 */

import { createHostedBackend } from './hostedBackend';
import { buildGroqRequest, readOpenAiReply } from './hostedRequests';

export const GROQ_MODEL_ID = 'openai/gpt-oss-120b';

export const groqBackend = createHostedBackend({
  provider: 'groq',
  label: 'Groq',
  description:
    'GPT-OSS 120B on Groq\u2019s free tier. Very fast, with strict JSON schema support; capped at 30 requests a minute and 1,000 a day.',
  modelId: GROQ_MODEL_ID,
  buildRequest: (apiKey, prompt, options) =>
    buildGroqRequest(GROQ_MODEL_ID, apiKey, prompt, options),
  readReply: (payload) => readOpenAiReply('groq', payload),
});
