/**
 * Mistral free tier ("Experiment" mode), the first link in the chain.
 *
 * Called with plain `fetch` rather than `@mistralai/mistralai`: Mistral's CORS
 * preflight allowlist does not include the `x-stainless-*` headers the OpenAI
 * style SDKs attach, so an SDK call is blocked from a browser before it is even
 * sent.
 */

import { createHostedBackend } from './hostedBackend';
import { buildMistralRequest, readOpenAiReply } from './hostedRequests';

export const MISTRAL_MODEL_ID = 'mistral-small-latest';

export const mistralBackend = createHostedBackend({
  provider: 'mistral',
  label: 'Mistral',
  description:
    'Mistral Small over the free Experiment tier. Good German, no download, and the API is not trained on.',
  modelId: MISTRAL_MODEL_ID,
  buildRequest: (apiKey, prompt, options) =>
    buildMistralRequest(MISTRAL_MODEL_ID, apiKey, prompt, options),
  readReply: (payload) => readOpenAiReply('mistral', payload),
});
