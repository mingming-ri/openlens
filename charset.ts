// "What's in the image?" Letting the user say the image is only words or only numbers
// stops the classic mix-ups (I vs 1, O vs 0, S vs 5, $ vs S, | vs l). We tell Tesseract which
// characters are allowed, then fix anything that still slips through. Pure helpers, no DOM.

export type ContentType = 'mixed' | 'words' | 'numbers';

const DIGITS = '0123456789٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹०१२३४५६७८९';
const NUMBER_CHARS = DIGITS + '.,:;-–+×x/%()$€£¥₹#*=<>°\'" ';
// Symbols that never belong in ordinary words but look like letters.
const WORD_BLOCKED_SYMBOLS = '|¢§©®¥€£$<>~^_{}[]\\`';

/** Tesseract parameters for each content type. Both are always set, so switching back clears them. */
export function tesseractParams(type: ContentType): Record<string, string> {
  return {
    tessedit_char_whitelist: type === 'numbers' ? NUMBER_CHARS : '',
    tessedit_char_blacklist: type === 'words' ? DIGITS + WORD_BLOCKED_SYMBOLS : '',
  };
}

// [lower, upper] letter each digit or symbol is usually mistaken for.
const TO_LETTER: Record<string, [string, string]> = {
  '0': ['o', 'O'], '1': ['l', 'I'], '2': ['z', 'Z'], '4': ['a', 'A'], '5': ['s', 'S'],
  '6': ['b', 'G'], '7': ['t', 'T'], '8': ['B', 'B'], '9': ['g', 'g'],
  '|': ['l', 'I'], '!': ['l', 'I'], '$': ['s', 'S'], '§': ['s', 'S'], '€': ['e', 'E'], '¢': ['c', 'C'],
  '©': ['c', 'C'], '®': ['r', 'R'], '¥': ['y', 'Y'], '@': ['a', 'A'],
};
const LETTER_TO_DIGIT: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', '|': '1', '!': '1',
  Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6', T: '7', g: '9', q: '9', A: '4',
};
// After a lone "1" (or "|", "l"), these words mean it was really "I".
const AFTER_I = new Set([
  'am', 'was', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'think', 'know', 'love', 'like',
  'want', 'need', 'do', 'did', "don't", 'dont', 'see', 'hope', 'feel', 'just', 'also', 'really', 'must', 'may',
]);
// …and it only starts a clause after one of these (so "Room 1 was full" stays).
const BEFORE_I = new Set(['and', 'but', 'so', 'then', 'because', 'that', 'when', 'if', 'what', 'where', 'why', 'how', 'or']);

// Lookalike fixes only make sense for alphabets with Latin-like shapes (not Chinese, Arabic or Hindi).
const isLetter = (c: string | undefined) => !!c && /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u.test(c);
const hasLatin = (s: string) => /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u.test(s);
const isDigit = (c: string | undefined) => !!c && /\p{Nd}/u.test(c);
const isUpperWord = (s: string) => {
  const letters = s.replace(/[^\p{L}]/gu, '');
  return letters.length > 0 ? letters === letters.toUpperCase() : true;
};
const looksLikeEmailOrLink = (s: string) => /@.+\.|^(https?:|www\.)/i.test(s);

/** Words only: every digit, and any lookalike symbol touching a letter, becomes a letter. */
function toLetters(token: string): string {
  if (looksLikeEmailOrLink(token)) return token;
  const upper = isUpperWord(token);
  const chars = [...token];
  return chars
    .map((c, i) => {
      const map = TO_LETTER[c];
      if (!map) return c;
      const touchesLetter = isLetter(chars[i - 1]) || isLetter(chars[i + 1]);
      if ((/[0-9]/.test(c) && hasLatin(token)) || touchesLetter || chars.length === 1) return map[upper ? 1 : 0];
      return c;
    })
    .join('');
}

function toDigits(token: string): string {
  // "S10.99" / "s5,00" at the start of a price is a dollar sign.
  let t = token.replace(/^[Ss](?=\d+[.,]\d)/, '$');
  if (!isDigit(t.match(/\p{Nd}/u)?.[0]) && !/^[OoIlSBZ|]+$/.test(t)) return t;
  t = t.replace(/[A-Za-z|!]/g, (c) => (c === 'x' ? c : LETTER_TO_DIGIT[c] ?? c));
  return t;
}

/** Mixed text: only fix a character when its neighbours say it's the wrong kind (H1GH, 2O24, he|lo, $ALE). */
function fixMixed(token: string): string {
  if (looksLikeEmailOrLink(token)) return token;
  const t = token.replace(/^[1|l](?=['’](m|ll|ve|d)\b)/, 'I');
  const chars = [...t];
  return chars
    .map((c, i) => {
      const a = chars[i - 1];
      const b = chars[i + 1];
      const between = isLetter(a) && isLetter(b);
      if ('015|!$€¢§'.includes(c) && between) {
        const upper = a === a.toUpperCase() && b === b.toUpperCase();
        return TO_LETTER[c][upper ? 1 : 0];
      }
      // "$ALE", "|t", "€XIT": a symbol starting a run of 2+ letters, with no digits around.
      if (i === 0 && '$|€§'.includes(c) && isLetter(b) && isLetter(chars[2]) && !/\p{Nd}/u.test(t)) {
        return TO_LETTER[c][isUpperWord(t.slice(1)) ? 1 : 0];
      }
      if ('OoIlS|'.includes(c) && isDigit(a) && isDigit(b)) return LETTER_TO_DIGIT[c];
      return c;
    })
    .join('');
}

/**
 * Random capitals inside a word ("cAsA", "hOla", "SALe") are misreads: letters like c/C, o/O,
 * s/S look alike in many fonts. Mostly-capital words become ALL CAPS, the rest lower case
 * (keeping the first letter as it was). Names like "McDonald" and "iPhone" are left alone.
 */
export function fixCase(token: string): string {
  if (/^(Mc|Mac|O')\p{Lu}/u.test(token)) return token;
  // A capital I between lower-case letters is a lower-case l ("eI" → "el", "heIlo" → "hello").
  let t = token.replace(/(?<=\p{Ll})I(?=\p{Ll}|$|[^\p{L}])/gu, 'l');
  const letters = t.replace(/[^\p{Script=Latin}]/gu, '');
  if (letters.length < 3) return t;
  if (/^[ie]\p{Lu}\p{Ll}+$/u.test(letters)) return t; // iPhone, eBay
  const rest = letters.slice(1);
  if (rest === rest.toLowerCase() || letters === letters.toUpperCase()) return t;
  const upper = [...letters].filter((c) => c !== c.toLowerCase()).length;
  if (upper / letters.length >= 0.6) return t.toUpperCase();
  let first = true;
  t = t.replace(/\p{Script=Latin}/gu, (c) => {
    if (first) {
      first = false;
      return c;
    }
    return c.toLowerCase();
  });
  return t;
}

/** Fixes one word, without looking at its neighbours. Used for the per-word OCR results too. */
export function fixToken(token: string, type: ContentType): string {
  if (type === 'words') return fixCase(toLetters(token));
  if (type === 'numbers') return toDigits(token);
  return fixCase(fixMixed(token));
}

/** Fixes the whole text, keeping all spacing and line breaks. */
export function fixCharacters(text: string, type: ContentType, language = 'eng'): string {
  const tokens = text.match(/\S+/g) ?? [];
  let i = -1;
  return text.replace(/\S+/g, (tok) => {
    i++;
    let out = fixToken(tok, type);
    // Spanish "Ia", "Ios", "Ias" are la, los, las: a capital I is rarely followed by a vowel.
    if (language === 'spa' && /^I[aeoáéó]\p{Ll}*[^\p{L}]*$/u.test(out)) out = 'l' + out.slice(1);
    // "1 am" / "| am" / "l am" → "I am" (English only).
    if (type !== 'numbers' && language === 'eng' && /^[1|l][,.]?$/.test(tok)) {
      const next = tokens[i + 1]?.toLowerCase().replace(/[^\p{L}']/gu, '');
      const prev = tokens[i - 1];
      const startsClause = !prev || /[.!?:;,"”)]$/.test(prev) || BEFORE_I.has(prev.toLowerCase());
      if (next && AFTER_I.has(next) && startsClause) out = 'I' + tok.slice(1);
    }
    return out;
  });
}

/** Keeps only alternative readings that fit the content type. */
export function fitsType(reading: string, type: ContentType): boolean {
  if (type === 'words') return !/[\p{Nd}|¢§©®¥€£$]/u.test(reading);
  if (type === 'numbers') return !/\p{L}/u.test(reading.replace(/x/g, ''));
  return true;
}

export const CONTENT_HINTS: Record<ContentType, string> = {
  mixed: 'Reads letters, numbers and symbols.',
  words: 'No numbers or stray symbols: stops mix-ups like I and 1, O and 0, S and $.',
  numbers: 'Only digits and symbols, for prices, phone numbers, codes and meters.',
};
