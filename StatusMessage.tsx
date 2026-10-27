import type { ReactNode } from 'react';
import { CheckCircle, Info, Warning, WarningCircle } from '@phosphor-icons/react';

type Tone = 'info' | 'success' | 'warn' | 'error';

const ICONS = { info: Info, success: CheckCircle, warn: Warning, error: WarningCircle };

/** Visual message. Errors use role="alert" so screen readers announce them immediately. */
export function StatusMessage({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <div className={`status status-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size="1.25em" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
