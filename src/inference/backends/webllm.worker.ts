/**
 * Worker host for the WebGPU tier.
 *
 * WebLLM's engine runs here rather than on the main thread so that token
 * decoding never blocks typing or scrolling. The handler owns the whole
 * protocol; this file is deliberately just its shell.
 */

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
