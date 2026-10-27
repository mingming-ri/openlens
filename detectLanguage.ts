// After a scan, guesses whether the text is in a different language than the one selected,
// so the app can offer "Switch & rescan". Looks at the writing system first (Han, Arabic,
// Devanagari, Latin), then tells English from Spanish by their most common little words.
const SCRIPTS: [code: string, test: RegExp][] = [
  ['chi_sim', /\p{Script=Han}/u],
  ['ara', /\p{Script=Arabic}/u],
  ['hin', /\p{Script=Devanagari}/u],
  ['latin', /\p{Script=Latin}/u],
];

const COMMON: Record<'eng' | 'spa', Set<string>> = {
  eng: new Set(['the', 'and', 'of', 'to', 'is', 'in', 'it', 'you', 'that', 'for', 'with', 'on', 'are', 'this', 'be', 'at', 'your', 'from', 'not', 'have', 'we', 'was', 'will', 'or', 'by']),
  spa: new Set(['el', 'la', 'de', 'que', 'y', 'en', 'los', 'las', 'del', 'por', 'un', 'una', 'para', 'con', 'es', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre']),
};
const SPANISH_MARKS = /[ñáéíóúü¿¡]/giu;
const LATIN = new Set(['eng', 'spa']);

export interface LanguageHint {
  /** A specific language that fits better, or undefined for "this doesn't look right". */
  suggest?: string;
}

function latinGuess(text: string): { eng: number; spa: number } {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let eng = 0;
  let spa = (text.match(SPANISH_MARKS) ?? []).length;
  for (const w of words) {
    if (COMMON.eng.has(w)) eng++;
    if (COMMON.spa.has(w)) spa++;
  }
  return { eng, spa };
}

export function suggestLanguage(text: string, current: string, confidence: number | null): LanguageHint | null {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 8) return null;
  const counts = new Map<string, number>();
  for (const ch of letters) {
    const hit = SCRIPTS.find(([, re]) => re.test(ch));
    if (hit) counts.set(hit[0], (counts.get(hit[0]) ?? 0) + 1);
  }
  const [script, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  if (n / letters.length >= 0.6) {
    if (script !== 'latin' && script !== current) return { suggest: script };
    if (script === 'latin') {
      const s = latinGuess(text);
      if (LATIN.has(current)) {
        const other = current === 'eng' ? 'spa' : 'eng';
        const mine = s[current as 'eng' | 'spa'];
        const theirs = s[other];
        if (theirs >= 3 && theirs >= mine * 2 + 1) return { suggest: other };
      } else {
        const best = s.spa > s.eng ? 'spa' : 'eng';
        if (s[best] >= 2) return { suggest: best };
      }
    }
  }
  // Scanning with the wrong language usually produces confident-looking nonsense at low confidence.
  const wordCount = text.match(/\S+/g)?.length ?? 0;
  if (confidence != null && confidence < 40 && wordCount >= 3) return {};
  return null;
}
