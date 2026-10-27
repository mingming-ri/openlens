// Translates the scanned text into another language. Tries the browser's built-in translator
// first (Chrome 138+ on computers: runs on the device, so the text stays private), then the
// site's AI service if one is set up.
import { aiTranslate, type AiStatus } from './describe';
import { findLanguage } from './languages';

export type TranslateVia = 'device' | 'ai';

/** Why a translation failed; the app shows a message in the user's language. */
export class TranslateError extends Error {
  constructor(public code: 'unavailable' | 'failed') {
    super(code);
  }
}

interface TranslatorLike {
  translate(text: string): Promise<string>;
}
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<TranslatorLike>;
}

const builtIn = (): TranslatorApi | null =>
  typeof self !== 'undefined' && 'Translator' in self ? (self as unknown as { Translator: TranslatorApi }).Translator : null;

/** Whether this device can translate at all (built-in translator or AI). */
export const canTranslate = (ai: AiStatus) => !!builtIn() || ai.enabled;

async function onDevice(from: string, to: string): Promise<boolean> {
  const T = builtIn();
  if (!T) return false;
  try {
    return (await T.availability({ sourceLanguage: from, targetLanguage: to })) !== 'unavailable';
  } catch {
    return false;
  }
}

const translators = new Map<string, Promise<TranslatorLike>>();

export async function translateText(
  text: string,
  fromCode: string,
  toCode: string,
  ai: AiStatus,
  onDownload?: (loaded: number) => void,
): Promise<{ text: string; via: TranslateVia }> {
  const from = findLanguage(fromCode);
  const to = findLanguage(toCode);

  if (await onDevice(from.speechLang, to.speechLang)) {
    try {
      const key = `${from.speechLang}>${to.speechLang}`;
      let p = translators.get(key);
      if (!p) {
        // The first use of a language pair downloads a small model; later uses are instant.
        p = builtIn()!.create({
          sourceLanguage: from.speechLang,
          targetLanguage: to.speechLang,
          monitor: (m) => m.addEventListener('downloadprogress', (e) => onDownload?.((e as ProgressEvent).loaded)),
        });
        translators.set(key, p);
        p.catch(() => translators.delete(key));
      }
      const tr = await p;
      // Paragraph by paragraph, so the breaks survive.
      const out: string[] = [];
      for (const para of text.split(/\n{2,}/)) out.push(para.trim() ? (await tr.translate(para)).trim() : '');
      return { text: out.join('\n\n'), via: 'device' };
    } catch (err) {
      console.warn('Built-in translation failed', err);
      if (!ai.enabled) throw new TranslateError('failed');
    }
  }

  if (!ai.enabled) throw new TranslateError('unavailable');
  try {
    return { text: await aiTranslate(text, from.english, to.english), via: 'ai' };
  } catch (err) {
    console.warn('AI translation failed', err);
    throw new TranslateError('failed');
  }
}
