# Übung — German reading & writing trainer

A German practice app that runs entirely in your browser. Read generated
passages and answer questions about them, keep a journal that gets corrected
with a word-level diff, and drill the vocabulary you pick up along the way with
a spaced-repetition scheduler.

There is no backend. No account, no API keys, no telemetry, no network calls at
runtime except downloading the language model itself. Everything you write and
every word you learn is stored in your own browser.

## Running it locally

```bash
npm install
npm run dev
```

That's the whole setup. Open the URL Vite prints (usually
`http://localhost:5173`) and the app walks you through a short first-run screen.

To produce a static build:

```bash
npm run build     # type-checks, then writes dist/
npm run preview   # serves dist/ locally
```

`dist/` is a plain folder of static files with relative asset paths, so it can be
dropped onto GitHub Pages, Vercel, Netlify, S3 or any web server without
configuration or rewrite rules.

Other scripts:

```bash
npm test          # SM-2 scheduler, mastery rules, diffing, prompt/schema mapping
npm run typecheck # tsc --noEmit
```

## How inference works

Text generation runs on your machine through one of three engines, chosen on
first run and changeable in Settings:

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
`src/inference/responseSchemas.ts` and passed to whichever engine is active:
WebLLM compiles it with XGrammar, wllama hands it to llama.cpp. `generateText`
looks the schema up from the prompt's `### TASK:` line, so no mode pipeline
knows constrained generation exists. The tolerant parser in
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

### Checking a real tier on your machine

Neither real tier can be covered by the test suite: one needs a GPU, both need
gigabytes of weights. The tests cover the request mapping, the schemas and the
mode pipelines against the mock tier, and the rest is a short manual pass:

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

Prompts are plain text in, plain text out; the schema that constrains a reply is
looked up inside `generateText`, not passed in by the caller. Even so the model
is never *trusted*: `src/inference/parse.ts` recovers JSON tolerantly, and the
journal diff is computed locally from the two plain texts rather than asked for.

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
- `settings` — inference tier and preferences

Nothing is synced or backed up. Clearing site data for this origin deletes it,
and Settings has an explicit "Delete all local data" action. The vocabulary store
starts empty; Settings also offers an optional 32-word starter list so training
has something to schedule on a fresh install.

## License

MIT
