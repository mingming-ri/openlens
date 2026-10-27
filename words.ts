// "Did you mean…?" for words the scanner wasn't sure about. Decorative, bubble and
// handwritten-style lettering often confuses OCR, so for each low-confidence word we
// collect a few other plausible readings the user can pick from. Pure helpers, no DOM.
import { fitsType, fixToken, type ContentType } from './charset';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The shape of a Tesseract word that we rely on (kept loose so tests can fake it). */
export interface OcrWord {
  text: string;
  confidence: number;
  bbox?: Box;
  choices?: { text: string; confidence: number }[];
  symbols?: { text: string; confidence?: number; choices?: { text: string; confidence: number }[] }[];
}

export interface WordChoice {
  /** Position of the word among the whitespace-separated words of the text. */
  token: number;
  original: string;
  /** The reading currently in the text. */
  chosen: string;
  /** Other possible readings, best first (never includes `original`). */
  options: string[];
  confidence: number;
  bbox: Box | null;
  ai?: 'loading' | 'error';
  aiSuggestion?: string;
  /** Changed automatically by smart fixing (see smart.ts). */
  auto?: boolean;
}

export const UNSURE_BELOW = 70;
const MAX_OPTIONS = 4;

// Shapes that decorative fonts commonly blur together. Ordered roughly by how often they occur.
const LOOKALIKES: [string, string][] = [
  ['rn', 'm'], ['m', 'rn'], ['vv', 'w'], ['cl', 'd'], ['li', 'h'], ['ii', 'u'],
  ['0', 'O'], ['O', '0'], ['0', 'o'], ['$', 'S'], ['$', 's'], ['€', 'E'], ['€', 'C'], ['@', 'a'], ['&', '8'], ['8', '&'], ['!', 'l'], ['!', 'i'], ['|', 'I'], ['1', 'I'], ['1', 'l'], ['l', 'I'], ['I', 'l'], ['|', 'l'],
  ['5', 'S'], ['S', '5'], ['8', 'B'], ['B', '8'], ['6', 'G'], ['2', 'Z'], ['4', 'A'], ['7', 'T'],
  ['c', 'e'], ['e', 'c'], ['n', 'u'], ['u', 'n'], ['a', 'o'], ['o', 'a'], ['h', 'b'], ['b', 'h'],
  ['f', 't'], ['t', 'f'], ['y', 'v'], ['v', 'y'], ['i', 'l'], ['C', 'G'], ['G', 'C'], ['Q', 'O'],
];

const hasLetter = (s: string) => /\p{L}/u.test(s);
const hasDigit = (s: string) => /\p{Nd}/u.test(s);

function caseVariants(word: string): string[] {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return [];
  const rest = letters.slice(1);
  const messy = rest !== rest.toLowerCase() && rest !== rest.toUpperCase();
  if (!messy) return [];
  const lower = word.toLowerCase();
  return [word.toUpperCase(), lower.replace(/\p{L}/u, (c) => c.toUpperCase()), lower];
}

function lookalikeVariants(word: string): string[] {
  const out: string[] = [];
  // Digits mixed into a word are almost always misread letters: fix them all at once first.
  if (hasLetter(word) && /[\p{Nd}|!$€¢§©®¥]/u.test(word)) {
    out.push(fixToken(word, 'words'));
  }
  for (const [from, to] of LOOKALIKES) {
    let at = word.indexOf(from);
    while (at !== -1) {
      out.push(word.slice(0, at) + to + word.slice(at + from.length));
      at = word.indexOf(from, at + 1);
    }
  }
  return out;
}

function symbolVariants(word: OcrWord): string[] {
  const symbols = word.symbols ?? [];
  if (!symbols.length) return [];
  const out: { text: string; score: number }[] = [];
  symbols.forEach((s, i) => {
    for (const c of s.choices ?? []) {
      if (!c.text || c.text === s.text) continue;
      const text = symbols.map((x, j) => (j === i ? c.text : x.text)).join('');
      out.push({ text, score: c.confidence });
    }
  });
  return out.sort((a, b) => b.score - a.score).map((o) => o.text);
}

/** Other possible readings for a word, best first. */
export function alternativesFor(word: OcrWord, type: ContentType = 'mixed'): string[] {
  const original = word.text.trim();
  const fromEngine = [...(word.choices ?? [])].sort((a, b) => b.confidence - a.confidence).map((c) => c.text);
  const all =
    type === 'numbers'
      ? [...fromEngine, ...symbolVariants(word), fixToken(original, 'numbers')]
      : [...fromEngine, ...symbolVariants(word), ...caseVariants(original), ...lookalikeVariants(original)];
  const seen = new Set([original]);
  const out: string[] = [];
  for (const raw of all) {
    const t = raw.trim();
    if (!t || /\s/.test(t) || seen.has(t) || !fitsType(t, type)) continue;
    seen.add(t);
    out.push(t);
    if (out.length === MAX_OPTIONS) break;
  }
  return out;
}

/** The whitespace-separated words of a text, in order. */
export const tokensOf = (text: string): string[] => text.match(/\S+/g) ?? [];

/**
 * Matches OCR words to word positions in the text, and returns a choice for each one the
 * scanner was unsure of. Keyed by word position.
 */
export function findUnsureWords(
  text: string,
  words: OcrWord[] | undefined,
  type: ContentType = 'mixed',
): Record<number, WordChoice> {
  const result: Record<number, WordChoice> = {};
  if (!words?.length) return result;
  const tokens = tokensOf(text);
  let cursor = 0;
  for (const w of words) {
    const t = w.text.trim();
    if (!t) continue;
    let found = -1;
    for (let j = cursor; j < Math.min(tokens.length, cursor + 4); j++) {
      if (tokens[j] === t) {
        found = j;
        break;
      }
    }
    if (found === -1) continue;
    cursor = found + 1;
    // Numbers are worth a second look too, except in words-only mode (where there are none).
    if (w.confidence >= UNSURE_BELOW || !(hasLetter(t) || (type !== 'words' && hasDigit(t)))) continue;
    result[found] = {
      token: found,
      original: t,
      chosen: t,
      options: alternativesFor(w, type),
      confidence: Math.round(w.confidence),
      bbox: w.bbox ?? null,
    };
  }
  return result;
}

/** Replaces the word at `token`. `shift` is how many extra words the replacement added. */
export function replaceToken(text: string, token: number, value: string): { text: string; shift: number } {
  let i = -1;
  const next = text.replace(/\S+/g, (m) => (++i === token ? value : m));
  return { text: next, shift: tokensOf(value).length - 1 };
}

/** Applies a chosen reading and keeps the other choices pointing at the right words. */
export function applyChoice(
  text: string,
  choices: Record<number, WordChoice>,
  token: number,
  value: string,
): { text: string; choices: Record<number, WordChoice> } {
  const { text: next, shift } = replaceToken(text, token, value);
  const out: Record<number, WordChoice> = {};
  for (const c of Object.values(choices)) {
    if (c.token === token) out[token] = { ...c, chosen: value };
    else {
      const t = c.token > token ? c.token + shift : c.token;
      out[t] = { ...c, token: t };
    }
  }
  return { text: next, choices: out };
}
