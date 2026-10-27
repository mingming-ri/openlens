import { useCallback, useEffect, useState } from 'react';
import { pauseSpeaking, resumeSpeaking, speakSentences, stopSpeaking } from './speech';
import type { Sentence } from './text';

export type PlayState = 'idle' | 'speaking' | 'paused';

/** Read-aloud state for the page: what's playing, and which sentence is being spoken. */
export function useSpeech() {
  const [state, setState] = useState<PlayState>('idle');
  const [current, setCurrent] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    stopSpeaking();
    setState('idle');
    setCurrent(-1);
  }, []);

  const play = useCallback((sentences: Sentence[], opts: { rate: number; voiceURI?: string; lang?: string }) => {
    setError(null);
    setState('speaking');
    speakSentences(sentences, {
      ...opts,
      onSentence: setCurrent,
      onEnd: () => {
        setState('idle');
        setCurrent(-1);
      },
      onError: (message) => {
        setState('idle');
        setCurrent(-1);
        setError(message);
      },
    });
  }, []);

  const pause = useCallback(() => {
    pauseSpeaking();
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    resumeSpeaking();
    setState('speaking');
  }, []);

  // Escape stops reading from anywhere on the page.
  useEffect(() => {
    if (state === 'idle') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, stop]);

  useEffect(() => () => stopSpeaking(), []);

  return { state, current, error, play, pause, resume, stop };
}

export type Speech = ReturnType<typeof useSpeech>;
