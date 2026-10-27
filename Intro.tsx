import { CaretDown, SpeakerHigh, Stop, X } from '@phosphor-icons/react';
import type { Sentence } from './text';
import { useI18n, type Strings } from './i18n';

/** Everything the "Listen" button reads, in the order it appears on screen. */
export function introSentences(t: Strings): Sentence[] {
  return [`${t.leadTitle}. ${t.leadBody}`, `${t.howTitle}.`, ...t.steps.map((s, i) => `${t.stepSpoken(i + 1)} ${s.title}. ${s.body}`)].map(
    (text, index) => ({ text, index, words: [] }),
  );
}

interface Props {
  open: boolean;
  aiEnabled: boolean;
  playing: boolean;
  current: number;
  onToggleOpen: (open: boolean) => void;
  onListen: () => void;
  onStop: () => void;
}

export function Intro({ open, aiEnabled, playing, current, onToggleOpen, onListen, onStop }: Props) {
  const { t } = useI18n();
  const lit = (i: number) => (playing && current === i ? ' is-current' : '');

  if (!open) {
    return (
      <div className="intro intro-collapsed">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggleOpen(true)} aria-expanded="false">
          <CaretDown size="1.1em" aria-hidden="true" />
          {t.showGuide}
        </button>
      </div>
    );
  }

  return (
    <section className="intro" aria-labelledby="intro-title">
      <div className="intro-lead">
        <div className={`intro-copy${lit(0)}`}>
          <h2 id="intro-title" className="intro-title">
            {t.leadTitle}
          </h2>
          <p className="intro-body">{t.leadBody}</p>
        </div>
        <div className="row intro-actions">
          {playing ? (
            <button type="button" className="btn btn-primary" onClick={onStop}>
              <Stop size="1.25em" weight="fill" aria-hidden="true" />
              {t.stop}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onListen}>
              <SpeakerHigh size="1.25em" aria-hidden="true" />
              {t.listenGuide}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggleOpen(false)} aria-expanded="true">
            <X size="1.1em" aria-hidden="true" />
            {t.hideGuide}
          </button>
        </div>
      </div>

      <h3 className={`intro-steps-title${lit(1)}`}>{t.howTitle}</h3>
      <ol className="intro-steps">
        {t.steps.map((s, i) => (
          <li key={i} className={`intro-step${lit(i + 2)}`}>
            <span className="intro-step-num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="intro-step-title">{s.title}</span>
            <span className="intro-step-body">{s.body}</span>
          </li>
        ))}
      </ol>

      <details className="intro-more">
        <summary>{t.moreTips}</summary>
        <ul>
          {t.tips(aiEnabled).map(([lead, body]) => (
            <li key={lead}>
              <strong>{lead}</strong> {body}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
