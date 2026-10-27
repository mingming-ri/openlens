import { useId, type ReactNode } from 'react';

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Spoken name when the visible label isn't words (e.g. the "A" text-size glyphs). */
  ariaLabel?: string;
}

interface Props<T extends string> {
  label: string;
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * One row of mutually exclusive choices. Built on native radio buttons, so Tab moves into
 * the group and the arrow keys change the choice, with no extra keyboard code.
 */
export function Segmented<T extends string>({ label, options, value, onChange, disabled }: Props<T>) {
  const id = useId();
  return (
    <div className="seg-field">
      <span id={`${id}-label`} className="seg-label">
        {label}
      </span>
      <div className="seg" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.map((o) => (
          <label key={o.value} className="seg-opt">
            <input
              type="radio"
              name={id}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              disabled={disabled}
              aria-label={o.ariaLabel}
            />
            <span aria-hidden={o.ariaLabel ? true : undefined}>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
