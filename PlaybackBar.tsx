import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Stop } from '@phosphor-icons/react';
import { getVoices, groupVoices, isSpeechSupported } from './speech';
import { Segmented } from './Segmented';
import { StatusMessage } from './StatusMessage';
import type { OcrLanguage } from './languages';
import { useI18n } from './i18n';
import type { Sentence } from './text';
import type { Settings } from './useSettings';
import type { Speech } from './useSpeech';

interface Props {
  speech: Speech;
  sentences: Sentence[];
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  language: OcrLanguage;
  onBeforePlay: () => void;
}

const SPEEDS = ['0.75', '1', '1.25', '1.5', '2'].map((v) => ({ value: v, label: `${v}×` }));

// Voices load asynchronously in most browsers.
function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!isSpeechSupported()) return;
    const load = () => setVoices(getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

export function PlaybackBar({ speech, sentences, settings, onChange, language, onBeforePlay }: Props) {
  const { t, name } = useI18n();
  const voices = useVoices();
  const groups = useMemo(() => groupVoices(voices, language.speechLang), [voices, language.speechLang]);

  if (!isSpeechSupported()) {
    return (
      <div className="playback">
        <StatusMessage tone="warn">
          {t.noSpeech}
        </StatusMessage>
      </div>
    );
  }

  const hasText = sentences.length > 0;
  const primary = () => {
    if (speech.state === 'speaking') return speech.pause();
    if (speech.state === 'paused') return speech.resume();
    onBeforePlay();
    // A voice picked for one language can't read another (e.g. after translating), so fall back to the best match.
    const chosen = voices.find((v) => v.voiceURI === settings.voiceURI);
    speech.play(sentences, {
      rate: settings.rate,
      voiceURI: chosen?.lang.toLowerCase().startsWith(language.speechLang) ? chosen.voiceURI : undefined,
      lang: language.speechLang,
    });
  };

  return (
    <div className="playback" role="group" aria-label={t.readAloudGroup}>
      <div className="row">
        <button type="button" className="btn btn-primary btn-play" onClick={primary} disabled={!hasText}>
          {speech.state === 'speaking' ? (
            <Pause size="1.25em" weight="fill" aria-hidden="true" />
          ) : (
            <Play size="1.25em" weight="fill" aria-hidden="true" />
          )}
          {speech.state === 'speaking' ? t.pause : speech.state === 'paused' ? t.resume : t.readAloud}
        </button>
        {speech.state !== 'idle' && (
          <button type="button" className="btn btn-secondary btn-icon" onClick={speech.stop} aria-label={t.stopEsc}>
            <Stop size="1.1em" weight="fill" aria-hidden="true" />
          </button>
        )}
      </div>

      <Segmented
        label={t.speed}
        options={SPEEDS}
        value={String(settings.rate)}
        onChange={(v) => onChange({ rate: Number(v) })}
      />

      <div className="voice-field">
        <label htmlFor="voice">{t.voice}</label>
        <select
          id="voice"
          className="input"
          value={settings.voiceURI}
          onChange={(e) => onChange({ voiceURI: e.target.value })}
        >
          <option value="">{t.bestVoice}</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={name(g.code)}>
              {g.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {speech.error && <StatusMessage tone="error">{t.speechError}</StatusMessage>}
    </div>
  );
}
