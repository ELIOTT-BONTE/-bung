# Übung — German reading & writing trainer

A German practice app that runs entirely in your browser. Read generated
passages and answer questions about them, keep a journal that gets corrected
with a word-level diff, and drill the vocabulary you pick up along the way with
a spaced-repetition scheduler.

There is no backend and no account. Out of the box there are no API keys and no
network calls at runtime except downloading the language model itself, and
everything you write is stored in your own browser.

If you would rather not download several gigabytes of weights, you can paste a
free API key for Mistral, Gemini or Groq into Settings and generation is handed
to them instead — at the cost of your prompts leaving the device. That is opt-in
and off until you add a key. See [Inference](#how-inference-works).

## Running it locally

```bash
npm install
npm run dev
```

That's the whole setup. Open the URL Vite prints (usually
`http://localhost:5173`) and the app walks you through a short first-run screen.

Optionally, `cp .env.example .env` and add a free API key or two to skip the
model download while developing. Keys can also be pasted into Settings at
runtime, which is the better option for a build anyone else will load — see
[API keys](#api-keys-and-what-they-cost-you).

To produce a static build:

```bash
npm run build     # type-checks, then writes dist/
npm run preview   # serves dist/ locally
```

`dist/` is a plain folder of static files with relative asset paths, so it can be
dropped onto GitHub Pages, Vercel, Netlify, S3 or any web server without
configuration or rewrite rules. Note that a build made with keys in `.env` has
those keys inlined in its JavaScript.

Other scripts:

```bash
npm test          # SM-2 scheduler, mastery rules, diffing, prompt/schema mapping,
                  # hosted request shapes and the fallback chain
npm run typecheck # tsc --noEmit
```

## How inference works

Every generation walks a chain of candidates and takes the first answer. Free
hosted tiers come first, because they are fast, good at German and cost nothing;
the engine on your own machine sits at the end, because it is the only candidate
that cannot run out of quota.

| # | Candidate | Model | Needs |
| --- | --- | --- | --- |
| 1 | [Mistral](https://console.mistral.ai/api-keys) free mode | `mistral-small-latest` | an API key |
| 2 | [Gemini](https://aistudio.google.com/apikey) free tier | `gemini-3.6-flash` | a restricted API key |
| 3 | [Groq](https://console.groq.com/keys) free tier | `openai/gpt-oss-120b` | an API key |
| 4 | the local engine you chose | see below | a download, or nothing for mock |

A provider with no key is skipped without a request, so **the chain is a no-op
until you add one** and the app behaves exactly as it did before: local engine
only. A provider that answers means no weights are ever downloaded.

A candidate is abandoned and the next one tried when it has no key, rejects the
key, rate-limits you, cannot be reached, or returns something the parsers cannot
use. Only your own cancellation stops the walk. If every candidate declines, the
error names each one and why, rather than reporting a single opaque failure.

### The local engine

The last link is one of three, chosen on first run and changeable in Settings:

| Tier | Engine | Model | Download | Needs |
| --- | --- | --- | --- | --- |
| WebGPU | [WebLLM](https://github.com/mlc-ai/web-llm) (MLC) | Llama 3.1 8B Instruct, q4f32 | ~5 GB | WebGPU and ~6 GB of GPU memory |
| WASM | [wllama](https://github.com/ngxson/wllama) (llama.cpp in WebAssembly) | Qwen2.5 1.5B Instruct, Q4\_K\_M | 940 MB | any modern browser |
| Mock (dev) | canned fixtures | — | none | nothing |

The WebGPU tier is only offered when `navigator.gpu` actually grants an adapter,
and it is the noticeably better German of the two — worth the download if the
device can hold it. The WASM tier runs on the CPU anywhere, and is the fallback
whenever WebGPU is unavailable or the 8B model does not fit. The mock tier
returns fixed German through the same prompt and parsing path, which makes it
the way to work on the app offline or without waiting on a download.

### API keys, and what they cost you

Keys can come from two places. Anything you paste into Settings is stored in
IndexedDB in your browser and goes nowhere else. Alternatively, copy
`.env.example` to `.env` and fill it in; a key typed in Settings overrides the
matching `.env` value.

Three things are worth being clear about:

- **`.env` keys end up in the bundle.** Vite inlines `VITE_`-prefixed variables
  at build time, so anyone who loads a site you built with keys present can read
  them and spend your quota. For a build other people will use, leave `.env`
  blank and let each person add their own key in Settings.
- **Your prompts leave the device.** Passages, journal entries and the sentences
  you write are sent to whichever provider answers. Journal entries in
  particular can be personal; if that matters, leave the keys blank and stay on
  the local engine.
- **Gemini's free tier may train on your input**, per Google's API terms, and
  requires a restricted or auth key — unrestricted keys are rejected outright.

Free tiers are also small. Groq allows 30 requests a minute and 1,000 a day per
organisation; Mistral and Google publish theirs only in their own consoles.
Running out is normal and is exactly what the next candidate is for.

Requests are hand-built with `fetch` rather than through vendor SDKs, for a
reason that is not stylistic: Mistral's CORS preflight rejects the `x-stainless-*`
headers the OpenAI-style SDKs attach, Groq's SDK refuses to run in a browser at
all, and Google's newer Interactions API cannot be reached from a browser
because its `Api-Revision` header is not on the CORS allowlist — which is why
Gemini here uses the older `models/…:generateContent` endpoint.

### Downloads and caching

Model weights are **not** in this repository and are never proxied through a
server of ours. Each tier fetches its weights straight from Hugging Face on
first use and caches them in the browser, so the wait happens once per browser
profile. Progress shows in a banner that follows you across screens, and
switching tier leaves the other tier's cache intact.

Before a first download the app checks `navigator.storage.estimate()` and warns
if there is not enough free space, and asks for `navigator.storage.persist()` so
that several gigabytes of weights are not silently evicted later.

If the 8B model fails to load for lack of GPU memory, the failure is reported
with a one-click offer to load Llama 3.2 3B (~1.8 GB) instead, rather than
leaving you at a dead end.

### Structured output

Five of the seven prompts need JSON back. Rather than hoping a small model
complies, each is defined once as a JSON Schema in
`src/inference/responseSchemas.ts` and translated for whichever candidate is
answering: WebLLM compiles it with XGrammar, wllama hands it to llama.cpp,
Mistral and Groq take it as strict `json_schema` (which is partly why Groq runs
gpt-oss — most Groq models only offer loose JSON mode), and Gemini takes it as a
`responseSchema`. That last one needs its own dialect, so
`src/inference/backends/hostedRequests.ts` strips `additionalProperties` and
states `propertyOrdering` explicitly.

`generateText` looks the schema up from the prompt's `### TASK:` line, so no mode
pipeline knows constrained generation exists. The tolerant parser in
`src/inference/parse.ts` stays in place as a backstop for the free-text prompts
and for any engine that ignores the constraint.

### Hosting and cross-origin isolation

wllama's multi-threaded build needs `SharedArrayBuffer`, which browsers only
grant to a cross-origin isolated page. That requires two response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

They are configured for the dev and preview servers in `vite.config.ts`, for
Vercel in `vercel.json`, and for Netlify and Cloudflare Pages in
`public/_headers`. `credentialless` is used rather than `require-corp` because
Hugging Face does not send CORP headers and `require-corp` would break the model
download itself.

**GitHub Pages cannot set response headers.** The app still works there, but the
WASM tier silently falls back to a single thread and is markedly slower. Use the
WebGPU tier, or host somewhere that can set headers, if that matters.

### Checking a real candidate on your machine

No real candidate can be covered by the test suite: the local tiers need a GPU
or gigabytes of weights, and the hosted ones need live keys and a real browser
to prove CORS works. The tests cover the request mapping, the failure
classification, the chain's ordering and the mode pipelines against the mock
tier, and the rest is a short manual pass.

Local engines:

1. Pick the tier in Settings and press **Prepare model**. Progress should be
   determinate and should keep updating while you navigate to another screen.
2. Run one pass through each of the three modes. Reading and Vocabulary exercise
   the constrained JSON calls; Journal exercises both a free-text call and a
   constrained one.
3. Reload the page and prepare again. It should be near-instant and the tier
   should show **already downloaded**.
4. On a device with less than ~6 GB of GPU memory, choosing WebGPU should fail
   with an offer to load the 3B model instead, not a raw error.
5. Confirm `crossOriginIsolated` is `true` in the console on your host of
   choice — if it is `false`, the WASM tier is running single-threaded.

Hosted providers, one key at a time so you know which one answered:

6. Add the key, then generate a passage. The network tab should show one request
   to that provider and **no** model weights being fetched.
7. Run Reading through to its questions. That is the constrained-JSON path, and
   it is where a schema the provider dislikes will show up as a 400.
8. Delete the key and generate again. The provider should be skipped silently,
   not reported as an error.
9. With all three keys set, exhaust one free tier (or use a deliberately wrong
   key) and confirm generation still succeeds from the next provider.

## Architecture

```
src/
  inference/   generateText() and the swappable backends behind it
  storage/     IndexedDB schema and repositories
  srs/         pure SM-2 scheduling, mastery derivation, exercise selection
  diff/        word-level diffing over diff-match-patch
  modes/       the three practice screens, each composing the layers above
  app/         shell, routing, settings, first-run flow
  ui/          small presentational primitives
```

`inference`, `storage`, `srs` and `diff` contain no React and do not import each
other, apart from `storage` calling the pure functions in `srs` when it persists
a review. Mode screens compose them; nothing composes a mode screen.

### One inference entry point

Every model call in the app — passage generation, question writing, vocabulary
extraction, answer evaluation, correction, sentence grading — goes through:

```ts
generateText(prompt: string, options?: InferenceOptions): Promise<string>
```

Prompts are plain text in, plain text out. Three things are looked up inside
`generateText` from the prompt's own intent rather than passed in by the caller:
the schema that constrains the reply (`responseSchemas.ts`), the decoding
settings it wants (`sampling.ts` — a passage is generated at temperature 0.8, a
journal correction at 0.1), and which of the six backends answers. No mode
pipeline knows the chain exists, which is what made adding three hosted
providers a change to one layer.

Even so the model is never *trusted*: `src/inference/parse.ts` recovers JSON
tolerantly, and the journal diff is computed locally from the two plain texts
rather than asked for.

`src/inference/chain.ts` owns the ordering and the failure policy but takes its
backends and its loader as injected dependencies, so the walk can be tested
without a network, a key or a GPU. That injection is also what keeps the local
model lazy: `ensureReady()` is called at the moment the walk reaches the local
candidate, never before.

### Exposure is not mastery

The vocabulary model draws a hard line between meeting a word and knowing it,
and enforces it in the schema rather than in UI code.

- **Exposure** — a word appearing in a generated passage, or being shown on the
  front of a flashcard. `recordExposure()` accepts no grade and no outcome, and
  can only touch `exposureCount`, `lastExposedAt` and `skillContexts`.
- **Mastery** — an evaluated act of recall or production: a flashcard answered
  correctly, a free-text comprehension answer that demonstrates the word, a
  journal entry using it, or a correct "use it in a sentence" attempt. These go
  through `recordMasteryAttempt()`, whose parameter type only admits active
  exercise types, so a passive event cannot be expressed.

Mastery is never a mutable counter. Every attempt appends a row to
`srsReviewLog`, and the level is recomputed from that log by
`deriveMastery()` — distinct successful days, a bonus for having produced the
word, minus failures since the last success, capped at 3 of 5 until the learner
has produced it at least once.

### German nouns

A noun is only ever stored with its article and its plural, and both must arrive
in the same model call that identified the word — nothing tries to infer gender
from a bare noun after the fact. Every extraction prompt demands `determiner` and
`pluralForm`, the `VocabDraft` type makes them mandatory for nouns at compile
time, and a noun that arrives without them is reported back to the screen as
unsaved instead of being stored half-complete. Nouns are always displayed in full,
e.g. `der Tisch, -e`.

## Your data

Everything lives in IndexedDB, in a database called `german-trainer`, in this
browser profile only:

- `vocab` — terms, definitions, noun gender and plural, exposure counts,
  SM-2 state and derived mastery
- `srsReviewLog` — one row per evaluated attempt; the source of truth for mastery
- `journalEntries` — original text, corrected text, computed diff, words touched
- `comprehensionSessions` — theme, passage, questions, answers, evaluations
- `settings` — local engine, hosted provider API keys, and preferences

Nothing is synced or backed up. Clearing site data for this origin deletes it,
and Settings has an explicit "Delete all local data" action, which takes the
saved API keys with it. The vocabulary store starts empty; Settings also offers
an optional 32-word starter list so training has something to schedule on a
fresh install.

The one exception to "everything stays here" is a configured hosted provider:
your prompts, and therefore the journal entries and sentences inside them, are
sent to it. Nothing else is — the vocabulary store, review log and diffs are all
computed and kept locally.

## License

MIT
