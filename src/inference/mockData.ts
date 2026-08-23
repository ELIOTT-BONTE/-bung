/**
 * Canned German content for the Mock (dev) tier. This exists so the whole app
 * is walkable before real model loading lands — it is not study material and
 * is deliberately small.
 */

export interface MockWord {
  term: string;
  partOfSpeech: 'noun' | 'verb' | 'adjective';
  determiner: 'der' | 'die' | 'das' | null;
  pluralForm: string | null;
  definition: string;
}

export const MOCK_WORD_BANK: readonly MockWord[] = [
  { term: 'Abend', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Abende', definition: 'evening' },
  { term: 'Antwort', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Antworten', definition: 'answer' },
  { term: 'Arbeit', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Arbeiten', definition: 'work' },
  { term: 'Aufgabe', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Aufgaben', definition: 'task' },
  { term: 'Bahnhof', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Bahnhöfe', definition: 'train station' },
  { term: 'Besprechung', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Besprechungen', definition: 'meeting' },
  { term: 'Bildschirm', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Bildschirme', definition: 'screen' },
  { term: 'Brot', partOfSpeech: 'noun', determiner: 'das', pluralForm: 'Brote', definition: 'bread' },
  { term: 'Buch', partOfSpeech: 'noun', determiner: 'das', pluralForm: 'Bücher', definition: 'book' },
  { term: 'Fahrkarte', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Fahrkarten', definition: 'travel ticket' },
  { term: 'Fenster', partOfSpeech: 'noun', determiner: 'das', pluralForm: 'Fenster', definition: 'window' },
  { term: 'Frage', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Fragen', definition: 'question' },
  { term: 'Freund', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Freunde', definition: 'friend' },
  { term: 'Gleis', partOfSpeech: 'noun', determiner: 'das', pluralForm: 'Gleise', definition: 'platform, track' },
  { term: 'Kaffee', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Kaffees', definition: 'coffee' },
  { term: 'Koffer', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Koffer', definition: 'suitcase' },
  { term: 'Kollege', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Kollegen', definition: 'colleague' },
  { term: 'Küche', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Küchen', definition: 'kitchen' },
  { term: 'Markt', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Märkte', definition: 'market' },
  { term: 'Morgen', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Morgen', definition: 'morning' },
  { term: 'Nachbarin', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Nachbarinnen', definition: 'neighbour (female)' },
  { term: 'Reise', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Reisen', definition: 'journey, trip' },
  { term: 'Stadt', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Städte', definition: 'city, town' },
  { term: 'Termin', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Termine', definition: 'appointment' },
  { term: 'Verspätung', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Verspätungen', definition: 'delay' },
  { term: 'Weg', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Wege', definition: 'way, path' },
  { term: 'Wetter', partOfSpeech: 'noun', determiner: 'das', pluralForm: 'Wetter', definition: 'weather' },
  { term: 'Woche', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Wochen', definition: 'week' },
  { term: 'Wohnung', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Wohnungen', definition: 'flat, apartment' },
  { term: 'Wort', partOfSpeech: 'noun', determiner: 'das', pluralForm: 'Wörter', definition: 'word' },
  { term: 'Zeit', partOfSpeech: 'noun', determiner: 'die', pluralForm: 'Zeiten', definition: 'time' },
  { term: 'Zug', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Züge', definition: 'train' },
  { term: 'ankommen', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to arrive' },
  { term: 'besprechen', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to discuss' },
  { term: 'bleiben', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to stay, to remain' },
  { term: 'brauchen', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to need' },
  { term: 'erklären', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to explain' },
  { term: 'schreiben', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to write' },
  { term: 'vergessen', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to forget' },
  { term: 'verstehen', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to understand' },
  { term: 'warten', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to wait' },
  { term: 'üben', partOfSpeech: 'verb', determiner: null, pluralForm: null, definition: 'to practise' },
  { term: 'deutlich', partOfSpeech: 'adjective', determiner: null, pluralForm: null, definition: 'clear, distinct' },
  { term: 'gemütlich', partOfSpeech: 'adjective', determiner: null, pluralForm: null, definition: 'cosy' },
  { term: 'müde', partOfSpeech: 'adjective', determiner: null, pluralForm: null, definition: 'tired' },
  { term: 'pünktlich', partOfSpeech: 'adjective', determiner: null, pluralForm: null, definition: 'on time' },
  { term: 'ruhig', partOfSpeech: 'adjective', determiner: null, pluralForm: null, definition: 'calm, quiet' },
  { term: 'schwierig', partOfSpeech: 'adjective', determiner: null, pluralForm: null, definition: 'difficult' },
];

export interface MockPassage {
  /** Lowercase keywords that route a learner's theme to this passage. */
  themeKeywords: readonly string[];
  text: string;
}

export const MOCK_PASSAGES: readonly MockPassage[] = [
  {
    themeKeywords: ['alltag', 'morgen', 'zuhause', 'wohnung', 'routine', 'daily', 'home', 'essen', 'küche'],
    text: [
      'Mein Morgen beginnt immer ruhig. Ich stehe um halb sieben auf, mache mir einen Kaffee und schaue kurz aus dem Fenster. Danach lese ich zehn Minuten in einem Buch, weil ich am Abend oft zu müde dafür bin.',
      'Um acht gehe ich in die Küche und schneide Brot für den ganzen Tag. Meine Nachbarin klopft manchmal an die Tür, weil sie eine Frage hat oder etwas aus meiner Wohnung braucht. Wir reden dann ein paar Minuten über das Wetter.',
      'Später gehe ich zu Fuß zum Markt. Der Weg dauert eine Viertelstunde, und ich brauche diese Zeit, um wirklich wach zu werden. Am Abend schreibe ich auf, was ich an diesem Tag gelernt habe.',
    ].join('\n\n'),
  },
  {
    themeKeywords: ['reise', 'reisen', 'zug', 'bahn', 'urlaub', 'travel', 'trip', 'stadt', 'ferien'],
    text: [
      'Am Freitag fahre ich mit dem Zug nach Hamburg. Ich packe nur einen kleinen Koffer, denn die Reise dauert keine drei Stunden. Meine Fahrkarte habe ich schon am Montag gekauft, weil sie dann günstiger ist.',
      'Am Bahnhof stehe ich immer zu früh auf dem Gleis. Ich warte gern, schaue den Leuten zu und trinke einen Kaffee. Heute hat der Zug zwanzig Minuten Verspätung, aber das macht mir nichts.',
      'In der Stadt möchte ich vor allem laufen. Ich habe keinen festen Plan, nur ein Buch und eine Liste mit drei Cafés. Wenn ich am Abend ankomme, bleibe ich meistens noch lange wach.',
    ].join('\n\n'),
  },
  {
    themeKeywords: ['arbeit', 'büro', 'job', 'work', 'office', 'kollegen', 'beruf', 'technik', 'nachrichten'],
    text: [
      'Meine Arbeit beginnt mit einer kurzen Besprechung. Wir sitzen zu fünft vor einem großen Bildschirm und besprechen die Aufgaben für die Woche. Mein Kollege erklärt seine Zahlen immer sehr deutlich, deshalb verstehe ich ihn gut.',
      'Am Dienstag habe ich einen Termin mit einer Kundin. Solche Gespräche sind manchmal schwierig, weil ich schnell die richtigen Wörter suchen muss. Ich schreibe mir vorher drei Fragen auf und übe die Antworten laut.',
      'Nach der Besprechung bleibt wenig Zeit. Ich vergesse leicht, wann ich eine Pause machen wollte, und arbeite dann bis halb sieben weiter.',
    ].join('\n\n'),
  },
];

export const MOCK_QUESTION_TEMPLATES: readonly ((noun: string) => string)[] = [
  () => 'Worum geht es in diesem Text? Antworte in zwei oder drei Sätzen.',
  (noun) => `Welche Rolle spielt ${noun} im Text? Erkläre es mit eigenen Worten.`,
  () => 'Was erfährt man über die Gewohnheiten oder Absichten der Person?',
  (noun) => `In welchem Zusammenhang wird ${noun} erwähnt, und warum ist das wichtig?`,
  () => 'Wie würdest du den letzten Abschnitt zusammenfassen?',
];

/**
 * Naive rewrite rules that stand in for a corrector model. They target real
 * beginner mistakes (uncapitalised nouns, `haben` with motion verbs, missing
 * comma before a subordinate clause) so the diff view has something to show.
 */
export const MOCK_CORRECTION_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\bhabe\s+gegangen\b/gi, 'bin gegangen'],
  [/\bhabe\s+gefahren\b/gi, 'bin gefahren'],
  [/\bhabe\s+geblieben\b/gi, 'bin geblieben'],
  [/\bhabe\s+gekommen\b/gi, 'bin gekommen'],
  [/\bich\s+bin\s+gegessen\b/gi, 'ich habe gegessen'],
];
