import { describe, expect, it } from 'vitest';
import {
  buildAnswerEvaluationPrompt,
  buildCorrectionPrompt,
  buildJournalVocabPrompt,
  buildPassagePrompt,
  buildQuestionsAndVocabPrompt,
  buildSentenceEvaluationPrompt,
} from './prompts';
import { ModelOutputError } from './parse';
import { SCHEMA_BY_INTENT, schemaForPrompt } from './responseSchemas';
import {
  parseAnswerEvaluations,
  parseCorrection,
  parseJournalVocab,
  parseQuestionsAndVocab,
  parseSentenceEvaluation,
} from './schemas';
import type { JsonSchema } from './types';

describe('schemaForPrompt', () => {
  it('finds a schema for every prompt that asks for JSON', () => {
    const jsonPrompts = [
      buildQuestionsAndVocabPrompt({ passage: 'Ein Text.', questionCount: 3, vocabCount: 5 }),
      buildAnswerEvaluationPrompt({
        passage: 'Ein Text.',
        questions: ['Warum?'],
        answers: ['Weil.'],
        trackedTerms: ['Bahnhof'],
      }),
      buildCorrectionPrompt('Ich gehe zum Bahnhof.'),
      buildJournalVocabPrompt({ originalText: 'Ich gehe.', correctedText: null, maxItems: 4 }),
      buildSentenceEvaluationPrompt({
        term: 'Bahnhof',
        displayForm: 'der Bahnhof, Bahnhöfe',
        definition: 'train station',
        sentence: 'Der Bahnhof ist groß.',
      }),
    ];

    for (const prompt of jsonPrompts) {
      expect(schemaForPrompt(prompt)).toBeDefined();
    }
  });

  it('leaves the long-form prose prompt unconstrained', () => {
    const passage = buildPassagePrompt({ theme: 'Reisen', knownTerms: [], newWordBudget: 5 });

    expect(schemaForPrompt(passage)).toBeUndefined();
  });

  it('returns nothing for text that is not one of our prompts', () => {
    expect(schemaForPrompt('what is the capital of Germany?')).toBeUndefined();
  });
});

/** Walks a schema, collecting anything a grammar compiler would choke on. */
function findPortabilityProblems(schema: JsonSchema, path = '$'): string[] {
  const problems: string[] = [];

  if (schema.type === 'object') {
    for (const field of schema.required ?? []) {
      if (!(field in schema.properties)) {
        problems.push(`${path}: required field "${field}" is not in properties`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      problems.push(...findPortabilityProblems(child, `${path}.${key}`));
    }
  }

  if (schema.type === 'array') {
    problems.push(...findPortabilityProblems(schema.items, `${path}[]`));
  }

  if (schema.type === 'string' && schema.enum?.some((value) => typeof value !== 'string')) {
    problems.push(`${path}: enum contains a non-string`);
  }

  return problems;
}

describe('response schemas', () => {
  it('declare only required fields they actually define', () => {
    for (const [intent, entry] of Object.entries(SCHEMA_BY_INTENT)) {
      expect(findPortabilityProblems(entry!.schema), intent).toEqual([]);
    }
  });

  it('survive the round trip to a string, which is how WebLLM takes them', () => {
    for (const [intent, entry] of Object.entries(SCHEMA_BY_INTENT)) {
      const serialized = JSON.stringify(entry!.schema);
      expect(JSON.parse(serialized), intent).toEqual(entry!.schema);
    }
  });

  it('use names unique enough to tell apart in logs', () => {
    const names = Object.values(SCHEMA_BY_INTENT).map((entry) => entry!.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

/**
 * The schemas and the parsers are two descriptions of the same reply. If they
 * drift, constrained output starts parsing to empty results rather than
 * failing loudly, so each schema gets a minimal conforming reply parsed here.
 */
describe('schemas agree with the parsers', () => {
  it('reads a conforming questions-and-vocab reply', () => {
    const reply = JSON.stringify({
      questions: ['Warum fährt sie zum Bahnhof?'],
      vocab: [
        {
          term: 'Bahnhof',
          partOfSpeech: 'noun',
          determiner: 'der',
          pluralForm: 'Bahnhöfe',
          definition: 'train station',
        },
        {
          term: 'fahren',
          partOfSpeech: 'verb',
          determiner: '',
          pluralForm: '',
          definition: 'to travel',
        },
      ],
    });

    const parsed = parseQuestionsAndVocab(reply);

    expect(parsed.questions).toHaveLength(1);
    expect(parsed.vocab[0]).toMatchObject({ determiner: 'der', pluralForm: 'Bahnhöfe' });
    // The empty strings the schema mandates for non-nouns must read as absent.
    expect(parsed.vocab[1]).toMatchObject({ determiner: null, pluralForm: null });
  });

  it('reads a conforming answer-evaluation reply', () => {
    const reply = JSON.stringify({
      results: [
        { questionIndex: 0, correct: true, feedback: 'Genau.', demonstratedTerms: ['Bahnhof'] },
      ],
    });

    const parsed = parseAnswerEvaluations(reply, 1);

    expect(parsed[0]).toMatchObject({ correct: true, demonstratedTerms: ['Bahnhof'] });
  });

  it('reads a conforming correction reply', () => {
    const reply = JSON.stringify({
      corrected: 'Das Wetter war schön.',
      summary: 'Fixed the noun gender.',
    });

    expect(parseCorrection(reply)).toEqual({
      correctedText: 'Das Wetter war schön.',
      summary: 'Fixed the noun gender.',
    });
  });

  it('reads a correction that ignored the schema and answered in plain German', () => {
    expect(parseCorrection('Das Wetter war schön.')).toEqual({
      correctedText: 'Das Wetter war schön.',
      summary: '',
    });
  });

  it('refuses a correction envelope with no rewrite in it', () => {
    const reply = JSON.stringify({ corrected: '', summary: 'Looks fine.' });

    // Reading this as "nothing to correct" is exactly the silent skip that made
    // a broken reply look like praise.
    expect(() => parseCorrection(reply)).toThrow(ModelOutputError);
  });

  it('reads a conforming journal-vocab reply', () => {
    const reply = JSON.stringify({
      vocab: [
        {
          term: 'Bahnhof',
          partOfSpeech: 'noun',
          determiner: 'der',
          pluralForm: 'Bahnhöfe',
          definition: 'train station',
          usedCorrectly: true,
          note: '',
        },
      ],
    });

    const parsed = parseJournalVocab(reply);

    expect(parsed[0]).toMatchObject({ usedCorrectly: true, note: null });
  });

  it('reads a conforming sentence-evaluation reply', () => {
    const reply = JSON.stringify({ correct: true, grade: 5, feedback: 'Sehr gut.' });

    expect(parseSentenceEvaluation(reply)).toEqual({
      correct: true,
      grade: 5,
      feedback: 'Sehr gut.',
    });
  });
});
