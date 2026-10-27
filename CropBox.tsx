import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { FULL_IMAGE, type CropRect } from './image';
import { useI18n } from './i18n';

interface Props {
  src: string;
  alt: string;
  rect: CropRect;
  onChange: (rect: CropRect) => void;
  disabled: boolean;
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Manual cropping. Drag on the image to draw the area to read.
 * Keyboard: Tab to the selection, then arrow keys move it and Shift + arrow keys resize it.
 */
export function CropBox({ src, alt, rect, onChange, disabled }: Props) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const point = (e: PointerEvent) => {
    const b = stageRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = point(e);
    onChange({ ...start.current, w: 0, h: 0 });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const p = point(e);
    onChange({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };

  const onPointerUp = () => {
    start.current = null;
    if (rect.w < 0.03 || rect.h < 0.03) onChange(FULL_IMAGE); // a tap, not a drag
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = moves[e.key];
    if (!d || disabled) return;
    e.preventDefault();
    const [dx, dy] = d;
    if (e.shiftKey) {
      const w = clamp(rect.w + dx, 0.05, 1 - rect.x);
      const h = clamp(rect.h + dy, 0.05, 1 - rect.y);
      onChange({ ...rect, w, h });
    } else {
      onChange({ ...rect, x: clamp(rect.x + dx, 0, 1 - rect.w), y: clamp(rect.y + dy, 0, 1 - rect.h) });
    }
  };

  return (
    <div className="crop">
      <div
        ref={stageRef}
        className="crop-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img src={src} alt={alt} draggable={false} />
        <div
          className="crop-sel"
          tabIndex={0}
          role="group"
          aria-roledescription={t.cropRole}
          aria-label={t.cropAria(pct(rect.w), pct(rect.h), pct(rect.x), pct(rect.y))}
          onKeyDown={onKeyDown}
          style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
        />
      </div>
      <div className="row">
        <p className="hint">{t.cropDrag}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(FULL_IMAGE)} disabled={disabled}>
          {t.cropWhole}
        </button>
      </div>
    </div>
  );
}
