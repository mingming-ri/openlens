// Pure text helpers (no browser APIs), so they're easy to unit-test.

// Chinese characters and full-width punctuation. Chinese isn't written with spaces between words.
const CJK = '\\p{Script=Han}\\u3000-\\u303f\\uff00-\\uffef';
const CJK_GAP = new RegExp(`(?<=[${CJK}])[ \\t]+(?=[${CJK}])`, 'gu');
const CJK_LINE = new RegExp(`(?<=[${CJK}])\\n(?=[${CJK}])`, 'gu');

/** Tidies raw OCR output: normalises line endings, strips trailing spaces, collapses big gaps. */
export function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(CJK_GAP, '') // Tesseract puts a space between every Chinese character
    .replace(CJK_LINE, '') // and breaks sentences at the end of each printed line
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Counts words; each Chinese character counts as one. */
export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const han = (t.match(/\p{Script=Han}/gu) ?? []).length;
  const rest = t.replace(/[\p{Script=Han}\u3000-\u303f\uff00-\uffef]+/gu, ' ').trim();
  return han + (rest ? rest.split(/\s+/).length : 0);
}

/**
 * Splits text into chunks of at most `maxLength` characters, breaking at sentence
 * boundaries where possible. Some browsers (notably Chrome) silently stop speaking
 * long utterances, so we never hand them one big block.
 */
export function splitIntoChunks(text: string, maxLength = 200): string[] {
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (!normalised) return [];
  const sentences = normalised.match(SENTENCE) ?? [normalised];
  const chunks: string[] = [];
  let current = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > maxLength) {
      if (current) chunks.push(current);
      current = '';
      chunks.push(...splitByWords(sentence, maxLength));
      continue;
    }
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = joined;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitByWords(sentence: string, maxLength: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of sentence.split(' ')) {
    const joined = current ? `${current} ${word}` : word;
    if (joined.length > maxLength && current) {
      out.push(current);
      current = word;
    } else {
      current = joined;
    }
  }
  if (current) out.push(current);
  return out;
}

// Sentence enders for English/Spanish (. ! ?), Chinese (。！？), Hindi (।) and Arabic (؟).
const SENTENCE = /[^.!?。！？।؟]+[.!?。！？।؟]+["'”’)\]]*|[^.!?。！？।؟]+$/g;

export interface Sentence {
  text: string;
  /** Position in reading order across the whole text; used to highlight what's being spoken. */
  index: number;
  /** The sentence's words, each with its position among all words of the text. */
  words: { text: string; token: number }[];
}

/** Splits text into paragraphs of sentences. Long sentences are broken up so speech never stalls. */
export function toParagraphs(text: string): Sentence[][] {
  let index = 0;
  let tokenBase = 0;
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const flat = para.replace(/\s+/g, ' ').trim();
      // Where each word starts, so pieces of a sentence can be traced back to a word position.
      const starts = Array.from(flat.matchAll(/\S+/g), (m) => m.index ?? 0);
      const tokenAt = (offset: number) => {
        let t = 0;
        while (t + 1 < starts.length && starts[t + 1] <= offset) t++;
        return tokenBase + t;
      };
      const out: Sentence[] = [];
      for (const m of flat.matchAll(SENTENCE)) {
        const raw = m[0];
        const sentence = raw.trim();
        if (!sentence) continue;
        let offset = (m.index ?? 0) + (raw.length - raw.trimStart().length);
        for (const piece of splitByWords(sentence, 220)) {
          let local = offset;
          const words = piece.split(' ').map((w) => {
            const word = { text: w, token: tokenAt(local) };
            local += w.length + 1;
            return word;
          });
          out.push({ text: piece, index: index++, words });
          offset += piece.length + 1;
        }
      }
      tokenBase += starts.length;
      return out;
    })
    .filter((p) => p.length > 0);
}

const STATUS_LABELS: Record<string, string> = {
  'preparing image': 'Cleaning up the image…',
  'loading tesseract core': 'Loading text recognition…',
  'initializing tesseract': 'Loading text recognition…',
  'initialized tesseract': 'Loading text recognition…',
  'loading language traineddata': 'Getting language data (first time only)…',
  'loaded language traineddata': 'Language data ready…',
  'initializing api': 'Preparing…',
  'initialized api': 'Preparing…',
  'recognizing text': 'Reading the image…',
};

/** Turns Tesseract's internal status strings into plain-language labels. */
export function describeStatus(status: string): string {
  return STATUS_LABELS[status] ?? 'Working…';
}
