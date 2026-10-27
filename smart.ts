// Smart word fixing: checks scanned words against a list of the 50,000 most common words in
// the language, and when a word isn't real but one of its lookalike readings is, switches to it.
// The change stays underlined, so the user can pick the scanned version back.
// Runs on the device: only the word list is downloaded (once, then cached); the image never is.
import { alternativesFor, tokensOf, type WordChoice } from './words';
import type { ContentType } from './charset';

/** word (lower case) → rank, 0 = most common. */
export type Dictionary = Map<string, number>;

// Word lists by Hermit Dave (github.com/hermitdave/FrequencyWords), built from OpenSubtitles. CC BY-SA 4.0.
const LIST_CODES: Record<string, string> = { eng: 'en', spa: 'es', ara: 'ar', hin: 'hi' };
const listUrl = (code: string) =>
  `https://cdn.jsdelivr.net/gh/hermitdave/FrequencyWords@master/content/2018/${code}/${code}_50k.txt`;

/** Chinese isn't split into words by spaces, so there's nothing to check word by word. */
export const supportsSmartFix = (language: string) => language in LIST_CODES;

export function parseWordList(raw: string): Dictionary {
  const dict: Dictionary = new Map();
  for (const line of raw.split('\n')) {
    const word = line.split(' ')[0]?.trim().toLowerCase();
    if (word && !dict.has(word)) dict.set(word, dict.size);
  }
  return dict;
}

const loading = new Map<string, Promise<Dictionary | null>>();

/** Downloads the word list for a language. Resolves to null if it can't (offline, blocked): fixing is skipped. */
export function loadDictionary(language: string): Promise<Dictionary | null> {
  const code = LIST_CODES[language];
  if (!code) return Promise.resolve(null);
  let p = loading.get(code);
  if (!p) {
    p = fetch(listUrl(code), { cache: 'force-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(parseWordList)
      .catch((err) => {
        console.warn('Word list unavailable; smart fixing skipped', err);
        loading.delete(code);
        return null;
      });
    loading.set(code, p);
  }
  return p;
}

/** The word itself, without surrounding punctuation, lower-cased. Lookalike symbols ($, |, €) are kept. */
export const wordKey = (token: string) =>
  token.toLowerCase().replace(/^["'“”‘’«»¿¡(\[{]+|["'“”‘’»,.;:!?)\]}…]+$/gu, '');

/** "SAlE" → "SALE" when the scanned word was in capitals. */
function matchCase(reading: string, original: string): string {
  const letters = original.replace(/[^\p{L}]/gu, '');
  return letters.length > 1 && letters === letters.toUpperCase() ? reading.toUpperCase() : reading;
}

const rankOf = (dict: Dictionary, token: string) => {
  const key = wordKey(token);
  if (!key) return undefined;
  return dict.get(key) ?? (key.includes("'") ? undefined : dict.get(key.replace(/’/g, "'")));
};

/** Real words first (most common first), then the rest in their original order. */
export function rankReadings(dict: Dictionary, readings: string[]): string[] {
  return readings
    .map((r, i) => ({ r, i, rank: rankOf(dict, r) }))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.i - b.i)
    .map((x) => x.r);
}

// A confidently-read word is only second-guessed if it has a digit or symbol stuck inside it.
const SUSPICIOUS = /\p{L}.*[\p{Nd}|!$@€¢§©®¥]|[\p{Nd}|!$€¢§©®¥].*\p{L}/u;
// Rare words are often names or jargon; don't "fix" a real word into one of those.
const MAX_FIX_RANK = 30000;

export interface SmartFixResult {
  text: string;
  choices: Record<number, WordChoice>;
  /** How many words were changed. */
  fixed: number;
}

/** Applies dictionary-based fixes to the scanned text and its unsure-word choices. */
export function smartFix(
  text: string,
  choices: Record<number, WordChoice>,
  dict: Dictionary,
  type: ContentType = 'mixed',
): SmartFixResult {
  if (type === 'numbers') return { text, choices, fixed: 0 };
  const tokens = tokensOf(text);
  const out: Record<number, WordChoice> = {};
  let fixed = 0;

  tokens.forEach((tok, i) => {
    const existing = choices[i];
    if (!existing && !SUSPICIOUS.test(tok)) return;
    if (!/\p{L}/u.test(tok)) {
      if (existing) out[i] = existing;
      return;
    }
    const options = existing?.options ?? alternativesFor({ text: tok, confidence: 0 }, type);
    const ranked = rankReadings(dict, options);
    const best = ranked[0];
    const bestRank = best !== undefined ? rankOf(dict, best) : undefined;
    const known = rankOf(dict, tok) !== undefined;

    if (!known && bestRank !== undefined && bestRank < MAX_FIX_RANK) {
      const chosen = matchCase(best, tok);
      tokens[i] = chosen;
      fixed++;
      out[i] = {
        token: i,
        original: tok,
        chosen,
        options: [chosen, ...ranked.filter((r) => r !== best && r !== chosen)],
        confidence: existing?.confidence ?? 0,
        bbox: existing?.bbox ?? null,
        auto: true,
      };
    } else if (existing) {
      out[i] = { ...existing, options: ranked };
    }
  });

  // Letters whose capital looks like the small one (c/C, o/O, s/S…) often come out capitalised
  // in the middle of a sentence: "la Casa es Sobre". Lower-case them when the plain word is a
  // very common one (common words are rarely names).
  tokens.forEach((tok, i) => {
    if (i === 0 || out[i]) return;
    const prev = tokens[i - 1];
    if (!/^[CcKkOoPpSsUuVvWwXxZz]\p{Ll}+[^\p{L}]*$/u.test(tok) || !/^\p{Lu}/u.test(tok)) return;
    if (/[.!?:;…"”»)]$/.test(prev) || !/^\p{Ll}/u.test(prev)) return;
    const lower = tok[0].toLowerCase() + tok.slice(1);
    const rank = rankOf(dict, lower);
    if (rank === undefined || rank > 3000) return;
    tokens[i] = lower;
    fixed++;
    out[i] = { token: i, original: tok, chosen: lower, options: [lower], confidence: 0, bbox: null, auto: true };
  });

  if (!fixed) return { text, choices: out, fixed };
  let k = -1;
  return { text: text.replace(/\S+/g, () => tokens[++k]), choices: out, fixed };
}
