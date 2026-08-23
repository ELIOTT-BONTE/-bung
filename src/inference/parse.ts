/**
 * Tolerant readers for model output. Small local models wrap JSON in prose,
 * fence it, or trail a stray comma, so nothing above this layer is allowed to
 * assume clean output — it all funnels through here.
 */

export class ModelOutputError extends Error {
  readonly raw: string;

  constructor(message: string, raw: string) {
    super(message);
    this.name = 'ModelOutputError';
    this.raw = raw;
  }
}

/** Strips markdown fences and leading labels from a plain-text answer. */
export function cleanText(raw: string): string {
  let text = raw.trim();
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(text);
  if (fence) text = fence[1];
  text = text.replace(/^(?:corrected(?:\s+text)?|antwort|ausgabe|output|passage)\s*:\s*/i, '');
  return text.trim();
}

/**
 * Finds the first balanced `{...}` or `[...]` run, ignoring braces inside
 * strings. More reliable than a greedy regex when the model adds commentary.
 */
function findJsonSpan(raw: string): string | null {
  const openIndex = raw.search(/[{[]/);
  if (openIndex === -1) return null;

  const opener = raw[openIndex];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return raw.slice(openIndex, i + 1);
    }
  }

  return null;
}

function repairJson(candidate: string): string {
  return candidate
    .replace(/,\s*([}\]])/g, '$1') // trailing commas
    .replace(/[\u201c\u201d]/g, '"') // smart double quotes
    .replace(/[\u2018\u2019]/g, "'");
}

export function parseJsonLoose(raw: string): unknown {
  const span = findJsonSpan(raw);
  if (!span) {
    throw new ModelOutputError('No JSON object or array found in model output', raw);
  }

  try {
    return JSON.parse(span);
  } catch {
    try {
      return JSON.parse(repairJson(span));
    } catch (error) {
      throw new ModelOutputError(`Model output was not valid JSON: ${(error as Error).message}`, raw);
    }
  }
}

export function asRecord(value: unknown, raw: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModelOutputError('Expected a JSON object in model output', raw);
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'ja', '1'].includes(normalized)) return true;
    if (['false', 'no', 'nein', '0'].includes(normalized)) return false;
  }
  return fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed === '-') return null;
  return trimmed;
}
