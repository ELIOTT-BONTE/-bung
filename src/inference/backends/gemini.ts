/**
 * Gemini Flash free tier, the second link in the chain.
 *
 * Deliberately uses the legacy `models/...:generateContent` endpoint. The newer
 * `/v1beta/interactions` API cannot be called from a browser at all: its
 * `Api-Revision` request header is not on `generativelanguage.googleapis.com`'s
 * CORS allowlist, so the preflight returns 403 without an
 * `Access-Control-Allow-Origin` header and the request never leaves the page.
 *
 * Two things to know about the key: it must be a restricted or auth key, since
 * unrestricted standard keys are now rejected, and free-tier traffic may be
 * used to improve Google's models.
 */

import { createHostedBackend } from './hostedBackend';
import { buildGeminiRequest, readGeminiReply } from './hostedRequests';

export const GEMINI_MODEL_ID = 'gemini-3.6-flash';

export const geminiBackend = createHostedBackend({
  provider: 'gemini',
  label: 'Gemini Flash',
  description:
    'Gemini 3.6 Flash over the free tier. Fast and strong at German; note that free-tier input may be used to improve Google models.',
  modelId: GEMINI_MODEL_ID,
  buildRequest: (apiKey, prompt, options) =>
    buildGeminiRequest(GEMINI_MODEL_ID, apiKey, prompt, options),
  readReply: readGeminiReply,
});
