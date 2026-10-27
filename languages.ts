// OCR languages offered in the UI.
// `code` is the Tesseract language code; `speechLang` is the BCP-47 tag used to pick
// a matching text-to-speech voice; `dir` sets the text box direction (Arabic is right-to-left).
// `label` is the native name with English in brackets; `short` is shown in the header on small phones.
// `flag` is the ISO country code of the flag shown next to it (a language isn't a country; these are the usual picks).
export interface OcrLanguage {
  code: string;
  label: string;
  english: string;
  short: string;
  flag: string;
  speechLang: string;
  dir: 'ltr' | 'rtl';
}

export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'eng', label: 'English', english: 'English', short: 'EN', flag: 'us', speechLang: 'en', dir: 'ltr' },
  { code: 'spa', label: 'Español (Spanish)', english: 'Spanish', short: 'ES', flag: 'es', speechLang: 'es', dir: 'ltr' },
  { code: 'chi_sim', label: '简体中文 (Chinese, Simplified)', english: 'Chinese', short: '中文', flag: 'cn', speechLang: 'zh', dir: 'ltr' },
  { code: 'ara', label: 'العربية (Arabic)', english: 'Arabic', short: 'AR', flag: 'sa', speechLang: 'ar', dir: 'rtl' },
  { code: 'hin', label: 'हिन्दी (Hindi)', english: 'Hindi', short: 'HI', flag: 'in', speechLang: 'hi', dir: 'ltr' },
];

/** Flag image (flagcdn.com, public domain flags). Images, not emoji, because Windows doesn't draw flag emoji. */
export const flagUrl = (l: OcrLanguage) => `https://flagcdn.com/${l.flag}.svg`;

/** Flag emoji for the native dropdown list, where images can't go. Empty on Windows, which shows letters instead. */
export function flagEmoji(l: OcrLanguage): string {
  if (typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)) return '';
  return [...l.flag.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('') + ' ';
}

export function findLanguage(code: string): OcrLanguage {
  return OCR_LANGUAGES.find((l) => l.code === code) ?? OCR_LANGUAGES[0];
}
