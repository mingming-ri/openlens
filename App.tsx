import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './Header';
import { ImagePanel } from './ImagePanel';
import { Reader, type ScanState } from './Reader';
import { PlaybackBar } from './PlaybackBar';
import { DescribePanel } from './DescribePanel';
import { Intro, introSentences } from './Intro';
import { getVoices } from './speech';
import { useSettings } from './useSettings';
import { useSpeech } from './useSpeech';
import { OcrError, recognizeImage } from './ocr';
import { aiReadText, getAiStatus, type AiStatus } from './describe';
import { OCR_LANGUAGES, findLanguage } from './languages';
import { TranslateError, canTranslate, translateText, type TranslateVia } from './translate';
import { FULL_IMAGE, MAX_FILE_BYTES, cropWordToFile, formatBytes, validateImageFile, type CropMode, type CropRect } from './image';
import { cleanOcrText, countWords, toParagraphs } from './text';
import { applyChoice, findUnsureWords, type WordChoice } from './words';
import { loadDictionary, smartFix, supportsSmartFix } from './smart';
import { suggestLanguage, type LanguageHint } from './detectLanguage';
import { I18nContext, findUiLanguage, makeI18n } from './i18n';

export default function App() {
  const { settings, update } = useSettings();
  const i18n = useMemo(() => makeI18n(settings.uiLang), [settings.uiLang]);
  const { t } = i18n;
  const uiLang = findUiLanguage(settings.uiLang);
  const speech = useSpeech();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ phase: 'idle' });
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState(false); // true when the text was typed, not scanned
  const [cropRect, setCropRect] = useState<CropRect>(FULL_IMAGE);
  const [ai, setAi] = useState<AiStatus>({ enabled: false });
  const [describeRequest, setDescribeRequest] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [choices, setChoices] = useState<Record<number, WordChoice>>({});
  const [introPlaying, setIntroPlaying] = useState(false);
  const [languageHint, setLanguageHint] = useState<LanguageHint | null>(null);
  const [translation, setTranslation] = useState<{ source: string; from: string; to: string; text: string; via: TranslateVia } | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState<string | null>(null); // progress label while working
  const [translateError, setTranslateError] = useState<string | null>(null);
  const ocrCanvas = useRef<HTMLCanvasElement | null>(null);

  const busy = scan.phase === 'working';
  const busyRef = useRef(false);
  busyRef.current = busy;
  const runId = useRef(0); // ignores results from an outdated scan
  const language = findLanguage(settings.language);
  // A translation only counts while the original it was made from is unchanged.
  const activeTranslation =
    translation && translation.source === text && translation.from === settings.language ? translation : null;
  const showing = !!activeTranslation && showTranslation && !editing;
  const shownText = showing ? activeTranslation!.text : text;
  const shownLanguage = showing ? findLanguage(activeTranslation!.to) : language;
  const translateTo =
    settings.translateTo && settings.translateTo !== settings.language
      ? settings.translateTo
      : uiLang.textCode !== settings.language
        ? uiLang.textCode
        : OCR_LANGUAGES.find((l) => l.code !== settings.language)!.code;
  const paragraphs = useMemo(() => toParagraphs(shownText), [shownText]);
  const sentences = useMemo(() => paragraphs.flat(), [paragraphs]);
  const words = countWords(shownText);
  const { stop } = speech;

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  useEffect(() => {
    if (speech.state === 'idle') setIntroPlaying(false);
  }, [speech.state]);

  const listenToIntro = () => {
    stop();
    // The guide is in the app language, so only use the chosen voice if it speaks that language.
    const voice = getVoices().find((v) => v.voiceURI === settings.voiceURI);
    speech.play(introSentences(t), {
      rate: settings.rate,
      voiceURI: voice?.lang.toLowerCase().startsWith(uiLang.speechLang) ? voice.voiceURI : undefined,
      lang: uiLang.speechLang,
    });
    setIntroPlaying(true);
  };

  // Is AI configured on the server? (Only true once an API key is added in Cloudflare.)
  useEffect(() => {
    void getAiStatus().then(setAi);
  }, []);

  // Object URL for the preview; revoked when the file changes.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const runScan = useCallback(
    async (target: File, crop: CropMode, engine: 'device' | 'ai', lang: string = settings.language) => {
      const id = ++runId.current;
      const langInfo = findLanguage(lang);
      stop();
      setText('');
      setChoices({});
      setLanguageHint(null);
      setShowTranslation(false);
      setTranslateError(null);
      ocrCanvas.current = null;
      setEditing(false);
      setTyped(false);
      announce(t.aReading);
      try {
        let result = '';
        let confidence: number | null = null;
        let unsure: Record<number, WordChoice> = {};
        let autoFixed = 0;
        if (engine === 'ai') {
          setScan({ phase: 'working', label: t.readingWith(ai.provider ?? t.ai), progress: null });
          result = cleanOcrText(await aiReadText(target, crop, langInfo.english, settings.content));
        } else {
          setScan({ phase: 'working', label: t.starting, progress: 0 });
          const r = await recognizeImage(
            target,
            { language: lang, accuracy: settings.accuracy, crop, content: settings.content },
            (p) => id === runId.current && setScan({ phase: 'working', label: t.status[p.status] ?? t.working, progress: p.progress }),
          );
          result = r.text;
          confidence = r.confidence;
          unsure = findUnsureWords(result, r.words, settings.content);
          ocrCanvas.current = r.canvas ?? null;
          if (settings.smartFix && result && supportsSmartFix(lang) && settings.content !== 'numbers') {
            if (id === runId.current) setScan({ phase: 'working', label: t.checkingWords, progress: null });
            const dict = await loadDictionary(lang);
            if (dict) {
              const s = smartFix(result, unsure, dict, settings.content);
              result = s.text;
              unsure = s.choices;
              autoFixed = s.fixed;
            }
          }
        }
        if (id !== runId.current) return;
        const n = countWords(result);
        const u = Object.values(unsure).filter((c) => !c.auto).length;
        setText(result);
        setChoices(unsure);
        setScan({ phase: 'done', source: engine, confidence });
        const hint = engine === 'device' && n ? suggestLanguage(result, lang, confidence) : null;
        setLanguageHint(hint);
        const hintText = hint?.suggest ? t.aHintSuggest(i18n.name(hint.suggest)) : hint ? t.aHintGeneric : '';
        announce(n ? t.aFound(n, u, autoFixed) + hintText : t.aNoText);
      } catch (err) {
        if (id !== runId.current) return;
        const message =
          err instanceof OcrError
            ? err.code === 'offline'
              ? t.ocrOffline
              : err.code === 'high'
                ? t.ocrHigh
                : t.ocrGeneric
            : err instanceof Error && err.message
              ? err.message // AI reading errors come from the server
              : t.ocrGeneric;
        setScan({ phase: 'error', message });
      }
    },
    [announce, stop, ai.provider, settings.language, settings.accuracy, settings.content, settings.smartFix, t, i18n],
  );

  const currentCrop = (): CropMode =>
    settings.crop === 'auto' ? 'auto' : settings.crop === 'manual' ? cropRect : null;
  const defaultEngine = ai.enabled && settings.engine === 'ai' ? 'ai' : 'device';

  const handleFile = useCallback(
    (f: File) => {
      if (busyRef.current) {
        setInputError(t.waitCurrent);
        return;
      }
      const check = validateImageFile(f);
      if (!check.ok) {
        setInputError(
          check.reason === 'type'
            ? t.fileType(f.name)
            : check.reason === 'empty'
              ? t.fileEmpty(f.name)
              : t.fileSize(f.name, formatBytes(f.size), formatBytes(MAX_FILE_BYTES)),
        );
        return;
      }
      setInputError(null);
      setFile(f);
      setCropRect(FULL_IMAGE);
      if (settings.crop === 'manual') {
        // Wait for the user to select an area.
        stop();
        setText('');
        setChoices({});
        setTyped(false);
        setEditing(false);
        setScan({ phase: 'idle' });
        announce(t.aImageLoaded);
        return;
      }
      void runScan(f, settings.crop === 'auto' ? 'auto' : null, defaultEngine);
    },
    [runScan, settings.crop, defaultEngine, stop, announce, t],
  );

  // Paste an image from the clipboard anywhere on the page (but not while typing text).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      const pasted = item?.getAsFile();
      if (pasted) {
        e.preventDefault();
        handleFile(pasted);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleFile]);

  const scanNow = () => file && runScan(file, currentCrop(), defaultEngine);
  const readWithAi = () => file && runScan(file, currentCrop(), 'ai');

  const openLanguagePicker = () => {
    const el = document.getElementById('ocr-language') as HTMLSelectElement | null;
    if (!el) return;
    el.focus();
    try {
      (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Older browsers: focus is enough; arrow keys or a tap open the list.
    }
  };

  const switchLanguage = (code: string) => {
    update({ language: code, voiceURI: '' });
    setLanguageHint(null);
    if (file) void runScan(file, currentCrop(), defaultEngine, code);
  };

  // Changing the text language rescans the current image, so the text always matches the picker.
  const changeSettings = (patch: Partial<typeof settings>) => {
    update(patch);
    const lang = patch.language;
    if (!lang || lang === settings.language || !file || typed || busyRef.current) return;
    if (settings.crop === 'manual' && scan.phase === 'idle') return; // still waiting for a selection
    void runScan(file, currentCrop(), defaultEngine, lang);
  };

  const translate = async () => {
    const source = text;
    const to = translateTo;
    stop();
    setTranslateError(null);
    setTranslating(t.translating);
    announce(t.aTranslating(i18n.name(to)));
    try {
      const r = await translateText(source, settings.language, to, ai, () => setTranslating(t.translateDownloading));
      setTranslation({ source, from: settings.language, to, text: r.text, via: r.via });
      setShowTranslation(true);
      announce(t.aTranslated(i18n.name(to)));
    } catch (err) {
      const msg = err instanceof TranslateError && err.code === 'unavailable' ? t.translateUnavailable : t.translateFailed;
      setTranslateError(msg);
      announce(msg);
    } finally {
      setTranslating(null);
    }
  };

  const chooseWord = (token: number, value: string) => {
    const r = applyChoice(text, choices, token, value);
    setText(r.text);
    setChoices(r.choices);
    announce(t.aChanged(value));
  };

  const askAiWord = async (token: number) => {
    const c = choices[token];
    const canvas = ocrCanvas.current;
    if (!c?.bbox || !canvas) return;
    const patch = (p: Partial<WordChoice>) =>
      setChoices((all) => (all[token] ? { ...all, [token]: { ...all[token], ...p } } : all));
    patch({ ai: 'loading' });
    announce(t.aAsking(ai.provider ?? t.ai));
    try {
      const wordFile = await cropWordToFile(canvas, c.bbox);
      const guess = cleanOcrText(await aiReadText(wordFile, null, language.english, settings.content)).split('\n')[0].trim();
      if (!guess) throw new Error('empty');
      patch({ ai: undefined, aiSuggestion: guess });
      announce(t.aSuggests(ai.provider ?? t.ai, guess));
    } catch {
      patch({ ai: 'error' });
    }
  };

  return (
    <I18nContext.Provider value={i18n}>
      <a href="#main" className="skip-link">
        {t.skipLink}
      </a>
      <Header settings={settings} onChange={changeSettings} />

      <main id="main">
        <Intro
          open={settings.introOpen}
          aiEnabled={ai.enabled}
          playing={introPlaying}
          current={speech.current}
          onToggleOpen={(introOpen) => {
            if (!introOpen && introPlaying) stop();
            update({ introOpen });
          }}
          onListen={listenToIntro}
          onStop={stop}
        />
        <div className="layout">
        <ImagePanel
          file={file}
          previewUrl={previewUrl}
          busy={busy}
          settings={settings}
          onChange={changeSettings}
          onFile={handleFile}
          onScan={scanNow}
          inputError={inputError}
          ai={ai}
          cropRect={cropRect}
          onCropChange={setCropRect}
        >
          {file && ai.enabled && (
            <DescribePanel
              file={file}
              provider={ai.provider}
              requestToken={describeRequest}
              onAnnounce={announce}
              onAppend={(d) => {
                setText((prev) => (prev ? `${prev}\n\n${d}` : d));
                setTyped(true);
              }}
            />
          )}
        </ImagePanel>

        <section className="reader" aria-label={t.textRegion}>
          <Reader
            scan={scan}
            text={text}
            words={words}
            paragraphs={paragraphs}
            current={introPlaying ? -1 : speech.current}
            playState={introPlaying ? 'idle' : speech.state}
            editing={editing}
            typed={typed}
            awaitingCrop={settings.crop === 'manual' && !!file && scan.phase === 'idle'}
            language={language}
            ai={ai}
            choices={editing || showing ? {} : choices}
            translate={{
              available: canTranslate(ai),
              to: translateTo,
              onTo: (code) => {
                update({ translateTo: code });
                setTranslateError(null);
              },
              busy: translating,
              error: translateError,
              result: activeTranslation ? { to: activeTranslation.to, via: activeTranslation.via } : null,
              showing,
              onShow: (v) => {
                stop();
                setShowTranslation(v);
              },
              onTranslate: () => void translate(),
            }}
            onChooseWord={chooseWord}
            onAskAiWord={(tok) => void askAiWord(tok)}
            onTextChange={(value) => {
              setText(value);
              setChoices({}); // positions no longer line up once the text is edited by hand
            }}
            onToggleEdit={() => {
              if (!editing) {
                stop();
                setShowTranslation(false);
              }
              setEditing(!editing);
            }}
            onStartTyping={() => {
              stop();
              setTyped(true);
              setChoices({});
              setEditing(true);
            }}
            onRetry={scanNow}
            onReadWithAi={readWithAi}
            onDescribe={() => setDescribeRequest((n) => n + 1)}
            languageHint={editing || typed ? null : languageHint}
            onSwitchLanguage={switchLanguage}
            onOpenLanguage={openLanguagePicker}
            onDismissHint={() => setLanguageHint(null)}
          />
          <PlaybackBar
            speech={speech}
            sentences={busy ? [] : sentences}
            settings={settings}
            onChange={update}
            language={shownLanguage}
            onBeforePlay={() => {
              setEditing(false);
              setIntroPlaying(false);
            }}
          />
        </section>
        </div>
      </main>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </I18nContext.Provider>
  );
}
