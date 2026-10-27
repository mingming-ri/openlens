import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowClockwise, CaretDown, Camera, Crop, Image as ImageIcon, Scan, UploadSimple } from '@phosphor-icons/react';
import { CropBox } from './CropBox';
import { Segmented } from './Segmented';
import { StatusMessage } from './StatusMessage';
import { OCR_LANGUAGES, findLanguage, flagEmoji, flagUrl } from './languages';
import { formatBytes, type CropRect } from './image';
import type { AiStatus } from './describe';
import type { Accuracy, ContentType, CropSetting, Engine, Settings } from './useSettings';
import { supportsSmartFix } from './smart';
import { useI18n } from './i18n';

interface Props {
  file: File | null;
  previewUrl: string | null;
  busy: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onFile: (file: File) => void;
  onScan: () => void;
  inputError: string | null;
  ai: AiStatus;
  cropRect: CropRect;
  onCropChange: (rect: CropRect) => void;
  children?: ReactNode;
}

// "Take photo" only makes sense on touch devices, where the browser offers the camera.
const isTouchDevice =
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);


export function ImagePanel(props: Props) {
  const { file, previewUrl, busy, settings, onChange, onFile, onScan, inputError, ai, cropRect, onCropChange } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const manual = settings.crop === 'manual';
  const { t, name } = useI18n();
  const textLang = findLanguage(settings.language);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) pick(e.dataTransfer.files);
  };

  const cameraButton = isTouchDevice && (
    <button type="button" className="btn btn-secondary" onClick={() => cameraRef.current?.click()} disabled={busy}>
      <Camera size="1.25em" aria-hidden="true" />
      {t.takePhoto}
    </button>
  );

  return (
    <section className="source" aria-label={t.imageRegion}>
      {/* The one text-language picker: a native select laid over a styled face. */}
      <div className="lang-chip">
        <span className="lang-chip-face" aria-hidden="true">
          <img className="flag" src={flagUrl(textLang)} alt="" width={20} height={15} />
          <span>
            {t.textLanguageChip}: <strong>{name(textLang.code)}</strong>
          </span>
          <CaretDown size="0.9em" />
        </span>
        <select
          id="ocr-language"
          aria-label={t.languageOfText}
          value={settings.language}
          onChange={(e) => onChange({ language: e.target.value, voiceURI: '' })}
          disabled={busy}
        >
          {OCR_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {flagEmoji(l)}
              {name(l.code)}
            </option>
          ))}
        </select>
      </div>
      {!file || !previewUrl ? (
        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Scan size="1.75em" aria-hidden="true" className="dropzone-icon" />
          <div>
            <p className="dropzone-title">{t.startTitle}</p>
            <p className="hint">{t.startHint}</p>
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <UploadSimple size="1.25em" aria-hidden="true" />
              {t.chooseImage}
            </button>
            {cameraButton}
          </div>
        </div>
      ) : (
        <>
          {manual ? (
            <CropBox src={previewUrl} alt={t.imageAlt(file.name)} rect={cropRect} onChange={onCropChange} disabled={busy} />
          ) : (
            <figure className="preview">
              <img src={previewUrl} alt={t.imageAlt(file.name)} />
            </figure>
          )}
          <p className="file-info">
            {file.name} · {formatBytes(file.size)}
          </p>
          <div className="row">
            <button type="button" className={`btn ${manual ? 'btn-primary' : 'btn-secondary'}`} onClick={onScan} disabled={busy}>
              {manual ? <Crop size="1.25em" aria-hidden="true" /> : <ArrowClockwise size="1.25em" aria-hidden="true" />}
              {manual ? t.scanSelected : t.scanAgain}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImageIcon size="1.25em" aria-hidden="true" />
              {t.anotherImage}
            </button>
            {cameraButton}
          </div>
        </>
      )}

      {inputError && <StatusMessage tone="error">{inputError}</StatusMessage>}
      {props.children}

      <div className="scan-settings" role="group" aria-labelledby="scan-settings-heading">
        <h2 id="scan-settings-heading" className="section-label">
          {t.scanSettings}
        </h2>


        <div className="setting-block">
          <Segmented<ContentType>
            label={t.imageHas}
            value={settings.content}
            onChange={(content) => onChange({ content })}
            disabled={busy}
            options={[
              { value: 'mixed', label: t.contentMixed },
              { value: 'words', label: t.contentWords },
              { value: 'numbers', label: t.contentNumbers },
            ]}
          />
          <p className="hint">{t.contentHints[settings.content]}</p>
        </div>

        {supportsSmartFix(settings.language) && settings.content !== 'numbers' && (
          <div className="setting-block">
            <Segmented<'on' | 'off'>
              label={t.fixMistakes}
              value={settings.smartFix ? 'on' : 'off'}
              onChange={(v) => onChange({ smartFix: v === 'on' })}
              disabled={busy}
              options={[
                { value: 'on', label: t.on },
                { value: 'off', label: t.off },
              ]}
            />
            <p className="hint">
              {settings.smartFix ? t.fixOnHint : t.fixOffHint}
            </p>
          </div>
        )}

        <div className="setting-block">
          <Segmented<CropSetting>
            label={t.cropping}
            value={settings.crop}
            onChange={(crop) => onChange({ crop })}
            disabled={busy}
            options={[
              { value: 'none', label: t.cropNone },
              { value: 'manual', label: t.cropManual },
              { value: 'auto', label: t.cropAuto },
            ]}
          />
          <p className="hint">{t.cropHints[settings.crop]}</p>
        </div>

        {ai.enabled && (
          <div className="setting-block">
            <Segmented<Engine>
              label={t.readWith}
              value={settings.engine}
              onChange={(engine) => onChange({ engine })}
              disabled={busy}
              options={[
                { value: 'device', label: t.thisDevice },
                { value: 'ai', label: t.ai },
              ]}
            />
            <p className="hint">
              {settings.engine === 'ai'
                ? t.aiReadHint(ai.provider ?? t.aiService)
                : t.privateHint}
            </p>
          </div>
        )}

        {settings.engine === 'device' || !ai.enabled ? (
          <div className="setting-block">
            <Segmented<Accuracy>
              label={t.accuracy}
              value={settings.accuracy}
              onChange={(accuracy) => onChange({ accuracy })}
              disabled={busy}
              options={[
                { value: 'standard', label: t.standard },
                { value: 'high', label: t.accHigh },
              ]}
            />
            {settings.accuracy === 'high' && (
              <StatusMessage tone="warn">
                {t.accHighWarn}
              </StatusMessage>
            )}
          </div>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
    </section>
  );
}
