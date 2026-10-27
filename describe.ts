// Client for the optional AI features (reading text, describing pictures).
// The browser never sees an API key: it calls our own /api/describe endpoint, which
// runs on Cloudflare (worker.js) and holds the key as a secret.
import { prepareForUpload, type CropMode } from './image';

export interface AiStatus {
  enabled: boolean;
  provider?: string;
}

/** Asks the server whether a key is configured, and which provider it uses. */
export async function getAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch('/api/describe', { headers: { accept: 'application/json' } });
    if (!res.ok) return { enabled: false };
    const body = (await res.json()) as { enabled?: unknown; provider?: unknown };
    return body.enabled === true
      ? { enabled: true, provider: typeof body.provider === 'string' ? body.provider : undefined }
      : { enabled: false };
  } catch {
    // e.g. local dev without the worker: the request returns HTML, so json() throws.
    return { enabled: false };
  }
}

async function callAi(payload: Record<string, unknown>): Promise<{ text?: string; description?: string }> {
  let res: Response;
  try {
    res = await fetch('/api/describe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the AI service. Check your internet connection.");
  }
  const body = (await res.json().catch(() => ({}))) as { text?: string; description?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `The AI service returned an error (${res.status}).`);
  return body;
}

/** Describes the whole picture in words. */
export async function describeImage(file: File): Promise<string> {
  const img = await prepareForUpload(file, null);
  const body = await callAi({ mode: 'describe', ...img });
  if (!body.description) throw new Error('The AI service returned an empty description.');
  return body.description;
}

/** Translates text with AI. Language labels are English names, e.g. "Spanish". */
export async function aiTranslate(text: string, fromLabel: string, toLabel: string): Promise<string> {
  const body = await callAi({ mode: 'translate', text, from: fromLabel, to: toLabel });
  if (!body.text) throw new Error('empty');
  return body.text;
}

/** Reads the text in the (optionally cropped) image with AI. Returns '' when there's no text. */
export async function aiReadText(
  file: File,
  crop: CropMode,
  languageLabel: string,
  content: 'mixed' | 'words' | 'numbers' = 'mixed',
): Promise<string> {
  const img = await prepareForUpload(file, crop);
  const body = await callAi({ mode: 'read', language: languageLabel, content, ...img });
  return body.text ?? '';
}
