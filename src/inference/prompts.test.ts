import { describe, expect, it } from 'vitest';
import { buildPassagePrompt, buildQuestionsAndVocabPrompt } from './prompts';

describe('buildPassagePrompt', () => {
  it('asks for the chosen length and CEFR band', () => {
    const prompt = buildPassagePrompt({
      theme: 'Reisen',
      knownTerms: ['Zug'],
      newWordBudget: 2,
      approximateWords: 80,
      level: 'A1',
    });

    expect(prompt).toContain('roughly 80 words');
    expect(prompt).toContain('CEFR A1');
    expect(prompt).toContain('Stay at A1');
    expect(prompt).toMatch(/--- LEVEL ---\nA1\n--- END LEVEL ---/);
  });
});

describe('buildQuestionsAndVocabPrompt', () => {
  it('asks for questions at the same CEFR band as the passage', () => {
    const prompt = buildQuestionsAndVocabPrompt({
      passage: 'Ich fahre mit dem Zug.',
      questionCount: 3,
      vocabCount: 4,
      level: 'C1',
    });

    expect(prompt).toContain('in German at CEFR C1');
  });
});
