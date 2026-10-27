// On-device text recognition with Tesseract.js. Runs in a Web Worker in the user's
// browser; the image is never uploaded. On first use Tesseract downloads its engine and
// language data from the jsDelivr CDN, then the browser caches them.
import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import { cleanOcrText } from './text';
import { prepareForOcr, type CropMode } from './image';
import type { Accuracy } from './useSettings';
import type { OcrWord } from './words';
import { fixCharacters, fixToken, tesseractParams, type ContentType } from './charset';
import { removeNoise, type OcrLineLike } from './noise';

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

export interface OcrResult {
  text: string;
  confidence: number; // 0..100
  /** Per-word results, used to offer other readings for unsure words. */
  words?: OcrWord[];
  /** The cleaned-up image the words' boxes refer to (for asking AI about one word). */
  canvas?: HTMLCanvasElement;
}

/** Why a scan failed; the app shows a message in the user's language. */
export class OcrError extends Error {
  constructor(public code: 'offline' | 'high' | 'generic') {
    super(code);
  }
}

export interface OcrOptions {
  language: string;
  accuracy: Accuracy;
  crop: CropMode;
  /** Words only / numbers only stops I-vs-1 style mix-ups. */
  content?: ContentType;
}

// "High accuracy" uses Tesseract's larger 'best' models instead of the default compact ones.
// They're several times bigger to download and slower to run, but make fewer mistakes.
const HIGH_ACCURACY_DATA = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_best@main';

let worker: TesseractWorker | null = null;
let workerKey: string | null = null;
let progressListener: ((p: OcrProgress) => void) | null = null;

async function getWorker(language: string, accuracy: Accuracy): Promise<TesseractWorker> {
  const key = `${language}:${accuracy}`;
  if (worker && workerKey === key) return worker;
  await terminateOcr();
  worker = await createWorker(language, 1, {
    logger: (m) => progressListener?.({ status: m.status, progress: m.progress ?? 0 }),
    ...(accuracy === 'high'
      ? { langPath: HIGH_ACCURACY_DATA, gzip: false, cachePath: 'openlens-best' }
      : { cachePath: 'openlens-standard' }),
  });
  await worker.setParameters({ preserve_interword_spaces: '1' });
  workerKey = key;
  return worker;
}

/** Frees the worker (it's recreated on the next scan). */
export async function terminateOcr(): Promise<void> {
  if (!worker) return;
  const w = worker;
  worker = null;
  workerKey = null;
  await w.terminate().catch(() => undefined);
}

export async function recognizeImage(
  file: File,
  options: OcrOptions,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  progressListener = onProgress ?? null;
  try {
    onProgress?.({ status: 'preparing image', progress: 0 });
    let input: HTMLCanvasElement | File = file;
    try {
      input = await prepareForOcr(file, options.crop);
    } catch (err) {
      console.warn('Image clean-up skipped', err);
    }
    const w = await getWorker(options.language, options.accuracy);
    const content = options.content ?? 'mixed';
    await w.setParameters(tesseractParams(content));
    const { data } = await w.recognize(input);
    // Drop shapes and textures that were read as text before tidying the rest.
    const clean = removeNoise(data.text, (data.lines ?? []) as OcrLineLike[], (data.words ?? []) as OcrWord[]);
    return {
      text: fixCharacters(cleanOcrText(clean.text), content, options.language),
      confidence: Math.round(data.confidence),
      words: clean.words.map((wd) => ({ ...wd, text: fixToken(wd.text, content) })),
      canvas: input instanceof HTMLCanvasElement ? input : undefined,
    };
  } catch (error) {
    console.error('OCR failed', error);
    await terminateOcr();
    if (navigator.onLine === false) {
      throw new OcrError('offline');
    }
    throw new OcrError(options.accuracy === 'high' ? 'high' : 'generic');
  } finally {
    progressListener = null;
  }
}
