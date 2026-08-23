export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** De-duplication key: case- and accent-form-insensitive, whitespace-trimmed. */
export function normalizeTerm(term: string): string {
  return term.trim().normalize('NFC').toLocaleLowerCase('de-DE');
}
