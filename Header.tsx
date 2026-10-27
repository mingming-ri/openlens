import { TEXT_SIZES, type Settings, type TextSize, type Theme } from './useSettings';
import { CaretDown, Moon, Sun } from '@phosphor-icons/react';
import { Segmented } from './Segmented';
import { UI_LANGUAGES, useI18n, type UiLang } from './i18n';
import { findLanguage, flagEmoji, flagUrl } from './languages';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

export function Header({ settings, onChange }: Props) {
  const { t, name } = useI18n();
  const current = UI_LANGUAGES.find((l) => l.code === settings.uiLang) ?? UI_LANGUAGES[0];
  const flagOf = (textCode: string) => findLanguage(textCode);
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <h1 className="wordmark">
            Open<span>Lens</span>
          </h1>
          <p className="tagline">{t.tagline}</p>
        </div>
        <div className="display-settings">
          <div className="seg-field">
            <span id="app-language-label" className="seg-label">
              {t.appLanguage}
            </span>
            <div className="lang-pick">
              <span className="lang-pick-face" aria-hidden="true">
                <img className="flag" src={flagUrl(flagOf(current.textCode))} alt="" width={20} height={15} />
                <span className="lang-full">{name(current.textCode)}</span>
                <span className="lang-short">{flagOf(current.textCode).short}</span>
                <CaretDown size="0.9em" />
              </span>
              <select
                id="app-language"
                aria-labelledby="app-language-label"
                value={settings.uiLang}
                onChange={(e) => onChange({ uiLang: e.target.value as UiLang })}
              >
                {UI_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} lang={l.code}>
                    {flagEmoji(flagOf(l.textCode))}
                    {name(l.textCode)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="display-settings" role="group" aria-label={t.displaySettings}>
            <Segmented<TextSize>
              label={t.textSize}
              value={settings.textSize}
              onChange={(textSize) => onChange({ textSize })}
              options={TEXT_SIZES.map((s, i) => ({
                value: s.value,
                label: <span className={`glyph glyph-${i}`}>A</span>,
                ariaLabel: t.textSizeAria(s.label),
              }))}
            />
            <Segmented
              label={t.contrast}
              value={settings.highContrast ? 'high' : 'standard'}
              onChange={(v) => onChange({ highContrast: v === 'high' })}
              options={[
                { value: 'standard', label: t.standard },
                { value: 'high', label: t.high },
              ]}
            />
            <Segmented<Theme>
              label={t.mode}
              value={settings.theme}
              onChange={(theme) => onChange({ theme })}
              options={[
                { value: 'dark', label: <><Moon size="1.1em" aria-hidden="true" /> {t.dark}</> },
                { value: 'light', label: <><Sun size="1.1em" aria-hidden="true" /> {t.light}</> },
              ]}
            />
          </div>
        </div>
      </header>
      <div className="rule" aria-hidden="true" />
    </>
  );
}
