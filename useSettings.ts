import { useCallback, useEffect, useState } from 'react';

export type TextSize = 'normal' | 'large' | 'larger' | 'largest';
export type Accuracy = 'standard' | 'high';
export type CropSetting = 'none' | 'manual' | 'auto';
export type Engine = 'device' | 'ai';
export type Theme = 'dark' | 'light';
export type { ContentType } from './charset';
import type { ContentType } from './charset';
import { deviceUiLang, findUiLanguage, type UiLang } from './i18n';

export const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'normal', label: '100%' },
  { value: 'large', label: '125%' },
  { value: 'larger', label: '150%' },
  { value: 'largest', label: '175%' },
];

export interface Settings {
  textSize: TextSize;
  highContrast: boolean;
  theme: Theme;
  introOpen: boolean;
  rate: number;
  voiceURI: string;
  language: string;
  accuracy: Accuracy;
  crop: CropSetting;
  engine: Engine;
  content: ContentType;
  /** Check words against a word list and fix obvious misreadings. */
  smartFix: boolean;
  /** Language of the app itself (buttons, guide, messages). */
  uiLang: UiLang;
  /** Last language the user translated into ('' = pick automatically). */
  translateTo: string;
}

const STORAGE_KEY = 'openlens.settings.v2';

function defaults(): Settings {
  return {
    textSize: 'normal',
    highContrast: Boolean(window.matchMedia?.('(prefers-contrast: more)').matches),
    theme: window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    introOpen: true,
    rate: 1,
    voiceURI: '',
    language: 'eng',
    accuracy: 'standard',
    crop: 'none',
    engine: 'device',
    content: 'mixed',
    smartFix: true,
    uiLang: deviceUiLang(),
    translateTo: '',
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) } : defaults();
  } catch {
    return defaults();
  }
}

/** Settings are saved in localStorage and applied as attributes on <html>, which the CSS reads. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing can block storage; settings just won't persist.
    }
    const root = document.documentElement;
    root.dataset.textSize = settings.textSize;
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    root.dataset.theme = settings.theme;
    root.lang = settings.uiLang;
    root.dir = findUiLanguage(settings.uiLang).dir;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', settings.theme === 'light' ? '#f3f3f7' : '#161826');
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  return { settings, update };
}
