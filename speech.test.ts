import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupVoices, isSpeechSupported, speakSentences, stopSpeaking } from './speech';

class FakeUtterance {
  text: string;
  rate = 1;
  lang = '';
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

let spoken: FakeUtterance[] = [];

function makeSynth() {
  return {
    speak: vi.fn((u: FakeUtterance) => {
      spoken.push(u);
    }),
    cancel: vi.fn(),
    getVoices: () => [],
    pause: vi.fn(),
    resume: vi.fn(),
  };
}

let synth = makeSynth();
const sentences = [
  { text: 'Hello there.', index: 0, words: [] },
  { text: 'How are you?', index: 1, words: [] },
];

beforeEach(() => {
  spoken = [];
  synth = makeSynth();
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

describe('speakSentences', () => {
  it('detects support', () => {
    expect(isSpeechSupported()).toBe(true);
  });

  it('cancels previous speech and queues one utterance per sentence', () => {
    speakSentences(sentences, { rate: 1.5, lang: 'en' });
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken.map((u) => u.text)).toEqual(['Hello there.', 'How are you?']);
    spoken.forEach((u) => {
      expect(u.rate).toBe(1.5);
      expect(u.lang).toBe('en');
    });
  });

  it('reports which sentence is being spoken, then the end', () => {
    const onSentence = vi.fn();
    const onEnd = vi.fn();
    speakSentences(sentences, { rate: 1, onSentence, onEnd });
    spoken[1].onstart?.();
    expect(onSentence).toHaveBeenCalledWith(1);
    spoken[1].onend?.();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('ignores callbacks from a stopped run', () => {
    const onEnd = vi.fn();
    speakSentences(sentences, { rate: 1, onEnd });
    stopSpeaking();
    spoken[1].onend?.();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('reports real errors but not cancellations', () => {
    const onError = vi.fn();
    speakSentences(sentences, { rate: 1, onError });
    spoken[0].onerror?.({ error: 'interrupted' });
    expect(onError).not.toHaveBeenCalled();
    spoken[0].onerror?.({ error: 'synthesis-failed' });
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('groupVoices', () => {
  const voices = [
    { name: 'Samantha', lang: 'en-US', voiceURI: 'sam' },
    { name: 'Bubbles', lang: 'en-US', voiceURI: 'bub' },
    { name: 'Zarvox', lang: 'en-US', voiceURI: 'zar' },
    { name: 'Mónica', lang: 'es-ES', voiceURI: 'mon' },
    { name: 'Thomas', lang: 'fr-FR', voiceURI: 'tho' },
  ];

  it('hides novelty voices and languages the app does not read', () => {
    const groups = groupVoices(voices, 'en');
    const all = groups.flatMap((g) => g.voices.map((v) => v.voiceURI));
    expect(all).toEqual(expect.arrayContaining(['sam', 'mon']));
    expect(all).not.toContain('bub');
    expect(all).not.toContain('zar');
    expect(all).not.toContain('tho');
  });

  it('puts the current language first and labels regions', () => {
    const groups = groupVoices(voices, 'es');
    expect(groups[0].label).toBe('Spanish');
    expect(groups[1].voices[0].title).toBe('Samantha · United States');
  });
});
