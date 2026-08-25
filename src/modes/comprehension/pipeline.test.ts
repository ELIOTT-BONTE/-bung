import { describe, expect, it } from 'vitest';
import { newWordBudgetFor, passageLengthById } from './pipeline';

describe('passage options', () => {
  it('introduces fewer new words at lower CEFR bands', () => {
    expect(newWordBudgetFor('A1')).toBeLessThan(newWordBudgetFor('B1'));
    expect(newWordBudgetFor('B1')).toBeLessThan(newWordBudgetFor('C1'));
  });

  it('maps length chips to word targets', () => {
    expect(passageLengthById('short').approximateWords).toBe(80);
    expect(passageLengthById('long').approximateWords).toBe(220);
  });
});
