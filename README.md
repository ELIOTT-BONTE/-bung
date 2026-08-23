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
npm test          # unit tests for the SM-2 scheduler, mastery rules and diffing
npm run typecheck # tsc --noEmit
```

## How inference works

Text generation runs on your machine through one of two in-browser engines,
chosen on first run and changeable in Settings:

| Tier | Engine | Notes |
| --- | --- | --- |
| WebGPU | [WebLLM](https://github.com/mlc-ai/web-llm) (MLC) | Fastest. Only offered when `navigator.gpu` actually grants an adapter. |
| WASM | [wllama](https://github.com/ngxson/wllama) (llama.cpp in WebAssembly) | Universal fallback. Works in any modern browser, slower, smaller model. |
| Mock (dev) | canned fixtures | No download. Deterministic German responses so every mode can be walked end to end. |

Model weights are **not** part of this repository. When a real tier is used, the
model is fetched client-side from a public model host on first use and cached by
the browser afterwards, so later sessions start without downloading again.

**Current status:** the two real tiers are stubs. They implement the full
interface, report their capability and their target model, and throw a clearly
marked `ModelNotWiredUpError` when asked to load or generate. Wiring the actual
engines up is a follow-up task and touches only
`src/inference/backends/webllm.ts` and `src/inference/backends/wllama.ts` — no
caller changes. Until then, use the **Mock (dev)** tier, which exercises the same
prompt and parsing path with fixed German content.

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

Prompts are plain text in, plain text out. The model is never trusted to emit a
particular structure: `src/inference/parse.ts` recovers JSON tolerantly, and the
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
