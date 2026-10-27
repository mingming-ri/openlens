import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, Check, Keyboard, PencilSimple, Sparkle, Translate, X } from '@phosphor-icons/react';
import { OCR_LANGUAGES, findLanguage, flagEmoji, flagUrl, type OcrLanguage } from './languages';
import type { TranslateVia } from './translate';
import { Segmented } from './Segmented';
import type { LanguageHint } from './detectLanguage';
import type { Sentence } from './text';
import type { AiStatus } from './describe';
import type { PlayState } from './useSpeech';
import type { WordChoice } from './words';
import { WordChoices } from './WordChoices';
import { useI18n, type Strings } from './i18n';

export type ScanState =
  | { phase: 'idle' }
  | { phase: 'working'; label: string; progress: number | null }
  | { phase: 'done'; source: 'device' | 'ai'; confidence: number | null }
  | { phase: 'error'; message: string };

interface Props {
  scan: ScanState;
  text: string;
  words: number;
  paragraphs: Sentence[][];
  current: number;
  playState: PlayState;
  editing: boolean;
  typed: boolean;
  awaitingCrop: boolean;
  language: OcrLanguage;
  ai: AiStatus;
  choices: Record<number, WordChoice>;
  onChooseWord: (token: number, value: string) => void;
  onAskAiWord: (token: number) => void;
  onTextChange: (text: string) => void;
  onToggleEdit: () => void;
  onStartTyping: () => void;
  onRetry: () => void;
  onReadWithAi: () => void;
  onDescribe: () => void;
  languageHint: LanguageHint | null;
  onSwitchLanguage: (code: string) => void;
  onOpenLanguage: () => void;
  onDismissHint: () => void;
  translate: {
    available: boolean;
    to: string;
    onTo: (code: string) => void;
    /** Progress label while translating, or null. */
    busy: string | null;
    error: string | null;
    result: { to: string; via: TranslateVia } | null;
    showing: boolean;
    onShow: (showTranslation: boolean) => void;
    onTranslate: () => void;
  };
}

type Tone = 'muted' | 'accent' | 'warn' | 'error';

function statusLine(p: Props, total: number, t: Strings): { text: string; tone: Tone } {
  const { scan, words, playState, current, editing, typed, ai } = p;
  if (scan.phase === 'working') {
    return { text: scan.progress == null ? scan.label : `${scan.label} ${Math.round(scan.progress * 100)}%`, tone: 'muted' };
  }
  if (playState !== 'idle' && current >= 0) {
    return { text: t.readingStatus(playState === 'paused', current + 1, total), tone: 'accent' };
  }
  if (scan.phase === 'error' && !editing) return { text: t.somethingWrong, tone: 'error' };
  if (words && scan.phase === 'done' && !typed) {
    if (scan.source === 'ai') return { text: t.readBy(words, ai.provider ?? t.ai), tone: 'muted' };
    const unsure = Object.values(p.choices).filter((c) => c.chosen === c.original).length;
    if (unsure) {
      return {
        text: t.unsureStatus(words, unsure),
        tone: 'warn',
      };
    }
    const low = (scan.confidence ?? 100) < 60;
    return low
      ? { text: t.maybeWrong(words), tone: 'warn' }
      : { text: t.clearRead(words), tone: 'muted' };
  }
  if (words) return { text: t.words(words), tone: 'muted' };
  if (editing) return { text: t.typeToRead, tone: 'muted' };
  if (scan.phase === 'done') return { text: t.nothingToRead, tone: 'muted' };
  return { text: p.awaitingCrop ? t.selectTextOnImage : t.noImage, tone: 'muted' };
}

export function Reader(props: Props) {
  const { scan, text, words, paragraphs, current, editing, language, ai, choices } = props;
  const { t, name } = useI18n();
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [openWord, setOpenWord] = useState<number | null>(null);
  const open = openWord != null ? choices[openWord] : undefined;
  const closeWord = () => {
    const t = openWord;
    setOpenWord(null);
    if (t != null) requestAnimationFrame(() => document.getElementById(`word-${t}`)?.focus());
  };
  const busy = scan.phase === 'working';
  const total = paragraphs.reduce((n, p) => n + p.length, 0);
  const status = statusLine(props, total, t);
  const lowConfidence = scan.phase === 'done' && scan.source === 'device' && (scan.confidence ?? 100) < 60;
  const tr = props.translate;
  const shown = tr.showing && tr.result ? findLanguage(tr.result.to) : language;

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  return (
    <div className="reader-main">
      <div className="reader-head">
        <p className={`reader-status tone-${status.tone}`}>{status.text}</p>
        {!busy && (words > 0 || editing) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={props.onToggleEdit} aria-pressed={editing}>
            {editing ? <Check size="1.1em" aria-hidden="true" /> : <PencilSimple size="1.1em" aria-hidden="true" />}
            {editing ? t.done : t.editText}
          </button>
        )}
      </div>

      <div className="reader-body">
        {!busy && !editing && props.languageHint && (
          <div className="status status-info lang-hint">
            <Translate size="1.25em" aria-hidden="true" />
            <p>
              {props.languageHint.suggest ? (
                <>
                  <img className="flag" src={flagUrl(findLanguage(props.languageHint.suggest))} alt="" width={20} height={15} />{' '}
                  {t.hintLooksLike(name(props.languageHint.suggest), name(language.code))}
                </>
              ) : (
                <>{t.hintNotLike(name(language.code))}</>
              )}
            </p>
            <div className="row">
              {props.languageHint.suggest ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => props.onSwitchLanguage(props.languageHint!.suggest!)}>
                  {t.switchRescan}
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={props.onOpenLanguage}>
                  {t.changeLanguage}
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-icon btn-icon-sm" onClick={props.onDismissHint} aria-label={t.dismissHint}>
                <X size="1.1em" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {busy && (
          <div className="progress-block">
            {scan.progress == null ? (
              <progress aria-label={scan.label} />
            ) : (
              <progress value={scan.progress} max={1} aria-label={t.progressAria} />
            )}
          </div>
        )}

        {!busy && editing && (
          <>
            <label htmlFor="edit-text" className="sr-only">
              {t.editLabel}
            </label>
            <textarea
              id="edit-text"
              ref={editRef}
              className="edit-area"
              lang={language.speechLang}
              dir={language.dir}
              value={text}
              onChange={(e) => props.onTextChange(e.target.value)}
              placeholder={t.typeHere}
              spellCheck
            />
          </>
        )}

        {!busy && !editing && tr.result && (
          <div className="translate-view">
            <Segmented<'original' | 'translation'>
              label={t.showing}
              value={tr.showing ? 'translation' : 'original'}
              onChange={(v) => tr.onShow(v === 'translation')}
              options={[
                { value: 'original', label: `${t.original} · ${name(language.code)}` },
                { value: 'translation', label: `${t.translation} · ${name(tr.result.to)}` },
              ]}
            />
            {tr.showing && (
              <p className="hint">{tr.result.via === 'device' ? t.viaDevice : t.viaAi(ai.provider ?? t.ai)}</p>
            )}
          </div>
        )}

        {!busy && !editing && words > 0 && (
          <div className="reading" lang={shown.speechLang} dir={shown.dir}>
            {paragraphs.map((p, i) => (
              <div key={i} className="reading-para">
                <p>
                  {p.map((s) => (
                    <span
                      key={s.index}
                      className={s.index === current ? 'sentence is-current' : 'sentence'}
                      aria-current={s.index === current ? 'true' : undefined}
                    >
                      {s.words.map((w, k) => {
                        const c = choices[w.token];
                        const space = k < s.words.length - 1 ? ' ' : '';
                        if (!c) return w.text + space;
                        const resolved = c.chosen !== c.original;
                        const isOpen = openWord === w.token;
                        return (
                          <span key={k}>
                            <button
                              type="button"
                              id={`word-${w.token}`}
                              className={`word-unsure${resolved ? ' is-resolved' : ''}${isOpen ? ' is-open' : ''}`}
                              aria-expanded={isOpen}
                              aria-label={t.wordAria(w.text, resolved)}
                              onClick={() => setOpenWord(isOpen ? null : w.token)}
                            >
                              {w.text}
                            </button>
                            {space}
                          </span>
                        );
                      })}{' '}
                    </span>
                  ))}
                </p>
                {open && p.some((s) => s.words.some((w) => w.token === open.token)) && (
                  <WordChoices
                    choice={open}
                    lang={language.speechLang}
                    dir={language.dir}
                    aiEnabled={ai.enabled}
                    aiProvider={ai.provider}
                    onChoose={(v) => {
                      props.onChooseWord(open.token, v);
                      closeWord();
                    }}
                    onAskAi={() => props.onAskAiWord(open.token)}
                    onClose={closeWord}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {!busy && !editing && words > 0 && (
          <div className="translate-bar">
            <div className="voice-field">
              <label htmlFor="translate-to">{t.translateTo}</label>
              <select
                id="translate-to"
                className="input"
                value={tr.to}
                onChange={(e) => tr.onTo(e.target.value)}
                disabled={!!tr.busy || !tr.available}
              >
                {OCR_LANGUAGES.filter((l) => l.code !== language.code).map((l) => (
                  <option key={l.code} value={l.code}>
                    {flagEmoji(l)}
                    {name(l.code)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={tr.onTranslate}
              disabled={!!tr.busy || !tr.available || (tr.showing && tr.result?.to === tr.to)}
            >
              <Translate size="1.25em" aria-hidden="true" />
              {tr.busy ?? t.translate}
            </button>
            {!tr.available && <p className="hint translate-msg">{t.translateUnavailable}</p>}
            {tr.error && (
              <p className="error-text translate-msg" role="alert">
                {tr.error}
              </p>
            )}
          </div>
        )}

        {!busy && !editing && lowConfidence && ai.enabled && (
          <div className="row reader-actions">
            <button type="button" className="btn btn-secondary" onClick={props.onReadWithAi}>
              <Sparkle size="1.25em" aria-hidden="true" />
              {t.readWithAiInstead}
            </button>
          </div>
        )}

        {!busy && !editing && words === 0 && scan.phase === 'done' && (
          <div className="empty">
            <p className="empty-text">{t.noTextFound}</p>
            {ai.enabled && (
              <div className="row">
                {scan.source === 'device' && (
                  <button type="button" className="btn btn-secondary" onClick={props.onReadWithAi}>
                    <Sparkle size="1.25em" aria-hidden="true" />
                    {t.readWithAi}
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={props.onDescribe}>
                  <Sparkle size="1.25em" aria-hidden="true" />
                  {t.describeInstead}
                </button>
              </div>
            )}
          </div>
        )}

        {!busy && !editing && scan.phase === 'error' && (
          <div className="empty" role="alert">
            <p className="error-text">{scan.message}</p>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={props.onRetry}>
                <ArrowClockwise size="1.25em" aria-hidden="true" />
                {t.tryAgain}
              </button>
            </div>
          </div>
        )}

        {!busy && !editing && words === 0 && scan.phase === 'idle' && (
          <div className="empty">
            <p className="placeholder">
              {props.awaitingCrop
                ? t.placeholderCrop
                : t.placeholder}
            </p>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={props.onStartTyping}>
                <Keyboard size="1.25em" aria-hidden="true" />
                {t.typeInstead}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
