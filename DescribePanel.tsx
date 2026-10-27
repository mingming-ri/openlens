import { useEffect, useRef, useState } from 'react';
import { Sparkle, TextIndent } from '@phosphor-icons/react';
import { describeImage } from './describe';
import { StatusMessage } from './StatusMessage';
import { useI18n } from './i18n';

interface Props {
  file: File;
  provider?: string;
  /** Increments when another part of the page asks for a description (e.g. "no text found"). */
  requestToken: number;
  onAppend: (description: string) => void;
  onAnnounce: (message: string) => void;
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; description: string }
  | { phase: 'error'; message: string };

/** Only rendered when the server says an API key is configured. */
export function DescribePanel({ file, provider, requestToken, onAppend, onAnnounce }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ phase: 'idle' });
  const resultRef = useRef<HTMLParagraphElement>(null);
  const fileRef = useRef(file);
  fileRef.current = file;

  useEffect(() => setState({ phase: 'idle' }), [file]);

  const run = async () => {
    const target = fileRef.current;
    setState({ phase: 'loading' });
    onAnnounce(t.announceDescribing);
    try {
      const description = await describeImage(target);
      if (fileRef.current !== target) return; // a new image was chosen meanwhile
      setState({ phase: 'done', description });
      onAnnounce(t.announceDescribed);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      console.warn('Describe failed', err);
      setState({ phase: 'error', message: t.describeFailed });
    }
  };

  useEffect(() => {
    if (requestToken > 0) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestToken]);

  return (
    <div className="ai-panel" role="region" aria-labelledby="ai-heading">
      <h3 id="ai-heading">
        <Sparkle size="1.1em" aria-hidden="true" /> {t.describeTitle} <span className="tag">{t.aiOptional}</span>
      </h3>
      <p className="hint">
        {t.describeHint(provider ?? t.aiService)}
      </p>
      <div className="row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={run}
          disabled={state.phase === 'loading'}
          aria-busy={state.phase === 'loading'}
        >
          <Sparkle size="1.25em" aria-hidden="true" />
          {state.phase === 'loading' ? t.describing : t.describeImage}
        </button>
      </div>
      {state.phase === 'done' && (
        <>
          <p className="description" ref={resultRef} tabIndex={-1}>
            {state.description}
          </p>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => onAppend(state.description)}>
              <TextIndent size="1.25em" aria-hidden="true" />
              {t.addToText}
            </button>
          </div>
        </>
      )}
      {state.phase === 'error' && <StatusMessage tone="error">{state.message}</StatusMessage>}
    </div>
  );
}
