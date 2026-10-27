// Drops bits of the picture the scanner mistook for text: logos, icons, borders, textures and
// photo edges come out as low-confidence lines made mostly of symbols ("~=| ®%"), or as lone
// symbol "words" at the ends of real lines. Real text, even hard-to-read lettering, is mostly
// letters and digits, so it's kept. Pure helpers, no DOM.
import type { Box } from './words';

export interface OcrLineLike {
  text: string;
  confidence: number;
  bbox?: Box;
}
export interface OcrWordLike {
  text: string;
  confidence: number;
  bbox?: Box;
}

const MEANINGFUL = /[\p{L}\p{Nd}]/u;
const HAN = /\p{Script=Han}/u;

/** True for a line that is almost certainly not text. */
export function isNoiseLine(line: OcrLineLike): boolean {
  const compact = line.text.replace(/\s+/g, '');
  if (!compact) return true;
  const chars = [...compact];
  const good = chars.filter((c) => MEANINGFUL.test(c)).length;
  const junk = 1 - good / chars.length;
  const tokens = line.text.trim().split(/\s+/);
  // Chinese is one character per "word", so short words are normal there.
  const shortWords = !HAN.test(compact) && tokens.length > 1 && good / tokens.length < 1.5;
  if (line.confidence < 25) return true;
  if (junk > 0.6) return true;
  if (line.confidence < 55 && (junk > 0.35 || shortWords)) return true;
  return false;
}

/** A low-confidence "word" with no letters or digits, like a stray "|", "~" or "®". */
export const isNoiseWord = (w: OcrWordLike) => w.confidence < 45 && !MEANINGFUL.test(w.text);

const inside = (a?: Box, b?: Box) =>
  !!a && !!b && a.x0 >= b.x0 - 2 && a.y0 >= b.y0 - 2 && a.x1 <= b.x1 + 2 && a.y1 <= b.y1 + 2;

/** Removes noise lines and stray symbol words from the scanned text and the per-word results. */
export function removeNoise<W extends OcrWordLike>(
  text: string,
  lines: OcrLineLike[],
  words: W[],
): { text: string; words: W[]; removed: number } {
  if (!lines.length) return { text, words, removed: 0 };
  const noisy = lines.filter(isNoiseLine);
  const out = text.split('\n');
  const drop = new Set<number>();
  for (const line of noisy) {
    const target = line.text.trim();
    const at = out.findIndex((l, i) => !drop.has(i) && l.trim() === target);
    if (at !== -1) drop.add(at);
  }
  const junk = new Set(words.filter(isNoiseWord).map((w) => w.text.trim()));
  let strays = 0;
  const kept = out
    .map((l, i) => {
      if (drop.has(i)) return null;
      return l
        .split(/(\s+)/)
        .filter((tok) => {
          const stray = !!tok.trim() && junk.has(tok) && !MEANINGFUL.test(tok);
          if (stray) strays++;
          return !stray;
        })
        .join('')
        .replace(/\s{2,}/g, ' ')
        .trimEnd();
    })
    .filter((l): l is string => l !== null);
  const keptWords = words.filter((w) => !isNoiseWord(w) && !noisy.some((line) => inside(w.bbox, line.bbox)));
  return { text: kept.join('\n'), words: keptWords, removed: drop.size + strays };
}
