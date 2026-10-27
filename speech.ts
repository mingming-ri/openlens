// Text-to-speech using the browser's built-in Web Speech API (free, no server).
// Voices come from the operating system, so they differ between devices.
import { OCR_LANGUAGES } from './languages';
import type { Sentence } from './text';

export interface SpeakOptions {
  rate: number;
  voiceURI?: string;
  lang?: string;
  /** Called as each sentence starts, with its index, so the page can highlight it. */
  onSentence?: (index: number) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

// Each speak call gets a new "generation". Callbacks from an older, cancelled
// run check this and do nothing, so they can't overwrite the current state.
let generation = 0;

export function isSpeechSupported(): boolean {
  return 'speechSynthesis' in globalThis && 'SpeechSynthesisUtterance' in globalThis;
}

export function getVoices(): SpeechSynthesisVoice[] {
  return isSpeechSupported() ? globalThis.speechSynthesis.getVoices() : [];
}

/** Queues one utterance per sentence. */
export function speakSentences(sentences: Sentence[], options: SpeakOptions): void {
  if (!isSpeechSupported()) {
    options.onError?.("Your browser doesn't support reading aloud.");
    return;
  }
  const synth = globalThis.speechSynthesis;
  synth.cancel();
  if (sentences.length === 0) return;

  const gen = ++generation;
  const voice = getVoices().find((v) => v.voiceURI === options.voiceURI);

  sentences.forEach((sentence, i) => {
    const u = new SpeechSynthesisUtterance(sentence.text);
    u.rate = options.rate;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else if (options.lang) {
      u.lang = options.lang;
    }
    u.onstart = () => gen === generation && options.onSentence?.(sentence.index);
    if (i === sentences.length - 1) u.onend = () => gen === generation && options.onEnd?.();
    u.onerror = (event) => {
      if (gen !== generation) return;
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      generation++;
      synth.cancel();
      options.onError?.(`Reading aloud stopped unexpectedly (${event.error}).`);
    };
    synth.speak(u);
  });
}

export function pauseSpeaking(): void {
  if (isSpeechSupported()) globalThis.speechSynthesis.pause();
}

export function resumeSpeaking(): void {
  if (isSpeechSupported()) globalThis.speechSynthesis.resume();
}

export function stopSpeaking(): void {
  generation++;
  if (isSpeechSupported()) globalThis.speechSynthesis.cancel();
}

// Novelty / sound-effect voices that ship with macOS and iOS. Hidden to keep the list usable.
const NOVELTY = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged', 'Good News', 'Hysterical',
  'Jester', 'Organ', 'Pipe Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Grandma', 'Grandpa',
]);

type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI'>;

export interface VoiceGroup {
  label: string;
  /** Text language code (e.g. 'spa'), so the UI can show the name in the app language. */
  code: string;
  voices: { voiceURI: string; title: string }[];
}

let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}

/**
 * Groups voices by the app's supported languages (the current language first),
 * drops novelty voices and duplicates, and labels each with its region, e.g. "Samantha · United States".
 */
export function groupVoices(voices: VoiceLike[], currentLang: string): VoiceGroup[] {
  const groups = OCR_LANGUAGES.map((l) => ({
    label: l.english,
    code: l.code,
    lang: l.speechLang,
    voices: [] as VoiceGroup['voices'],
  }));
  const seen = new Set<string>();
  for (const v of voices) {
    const base = v.name.split(' (')[0].trim();
    if (NOVELTY.has(base) || seen.has(v.voiceURI)) continue;
    const group = groups.find((g) => v.lang.toLowerCase().startsWith(g.lang));
    if (!group) continue;
    seen.add(v.voiceURI);
    const code = v.lang.split(/[-_]/)[1];
    let region = '';
    try {
      region = code && regionNames ? regionNames.of(code.toUpperCase()) ?? '' : '';
    } catch {
      region = '';
    }
    group.voices.push({ voiceURI: v.voiceURI, title: region ? `${base} · ${region}` : base });
  }
  return groups
    .filter((g) => g.voices.length > 0)
    .map((g) => ({ ...g, voices: g.voices.sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => Number(b.lang === currentLang) - Number(a.lang === currentLang))
    .map(({ label, code, voices: list }) => ({ label, code, voices: list }));
}
