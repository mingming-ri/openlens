import { useEffect, useRef, useState } from 'react';
import { Check, Sparkle, X } from '@phosphor-icons/react';
import type { WordChoice } from './words';
import { useI18n } from './i18n';

interface Props {
  choice: WordChoice;
  lang: string;
  dir: 'ltr' | 'rtl';
  aiEnabled: boolean;
  aiProvider?: string;
  onChoose: (value: string) => void;
  onAskAi: () => void;
  onClose: () => void;
}

/** The "did you mean…?" panel shown under a paragraph when an unsure word is opened. */
export function WordChoices({ choice, lang, dir, aiEnabled, aiProvider, onChoose, onAskAi, onClose }: Props) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState('');
  const headingId = `word-choices-${choice.token}`;

  const readings = [
    ...(choice.aiSuggestion ? [choice.aiSuggestion] : []),
    choice.original,
    ...choice.options,
    ...(choice.chosen !== choice.original && !choice.options.includes(choice.chosen) ? [choice.chosen] : []),
  ].filter((v, i, all) => all.indexOf(v) === i);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('.word-option')?.focus();
  }, [choice.token]);

  return (
    <div
      ref={panelRef}
      className="word-choices"
      role="group"
      aria-labelledby={headingId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="word-choices-head">
        <p id={headingId} className="word-choices-title">
          {t.readingsFor} <span lang={lang} dir={dir}>“{choice.original}”</span>
        </p>
        <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" onClick={onClose} aria-label={t.closeChoices}>
          <X size="1.1em" aria-hidden="true" />
        </button>
      </div>

      {choice.auto && choice.chosen !== choice.original && (
        <p className="hint">
          {t.autoChanged(choice.original)}
        </p>
      )}

      <div className="word-options" lang={lang} dir={dir}>
        {readings.map((r) => {
          const selected = r === choice.chosen;
          return (
            <button
              key={r}
              type="button"
              className={selected ? 'btn btn-secondary word-option is-selected' : 'btn btn-secondary word-option'}
              aria-pressed={selected}
              onClick={() => onChoose(r)}
            >
              {selected && <Check size="1em" aria-hidden="true" />}
              {r}
              {r === choice.aiSuggestion && <span className="word-option-tag">{aiProvider ?? t.ai}</span>}
              {r === choice.original && r !== choice.aiSuggestion && <span className="sr-only">{t.asScanned}</span>}
            </button>
          );
        })}
      </div>

      <div className="word-choices-foot">
        <form
          className="word-own"
          onSubmit={(e) => {
            e.preventDefault();
            if (own.trim()) {
              onChoose(own.trim());
              setOwn('');
            }
          }}
        >
          <label htmlFor={`${headingId}-own`} className="sr-only">
            {t.typeYourself}
          </label>
          <input
            id={`${headingId}-own`}
            className="input word-own-input"
            lang={lang}
            dir={dir}
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            placeholder={t.orType}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-ghost btn-sm" disabled={!own.trim()}>
            {t.use}
          </button>
        </form>
        {aiEnabled && choice.bbox && !choice.aiSuggestion && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onAskAi} disabled={choice.ai === 'loading'}>
            <Sparkle size="1.1em" aria-hidden="true" />
            {choice.ai === 'loading' ? t.asking : t.askAi(aiProvider ?? t.ai)}
          </button>
        )}
      </div>
      {choice.ai === 'error' && (
        <p className="word-choices-error" role="alert">
          {t.aiWordError}
        </p>
      )}
    </div>
  );
}
