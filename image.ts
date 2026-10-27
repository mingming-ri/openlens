// Image helpers: file checks, cropping, and clean-up before text recognition.

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export type ValidationResult = { ok: true } | { ok: false; reason: 'type' | 'empty' | 'size'; message: string };

export function validateImageFile(file: File): ValidationResult {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      ok: false,
      reason: 'type',
      message: `“${file.name}” isn't an image this app can read. Try a PNG, JPEG, WebP, GIF or BMP.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: 'empty', message: `“${file.name}” is empty. Please choose another image.` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: 'size',
      message: `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
    };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A crop area as fractions (0–1) of the image's width and height. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_IMAGE: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/** null = whole image, 'auto' = detect the text area, or a rectangle the user drew. */
export type CropMode = CropRect | 'auto' | null;

/**
 * Automatic cropping. Finds the area of a greyscale image that contains detail (edges),
 * so empty table tops, walls and margins around a document are trimmed off.
 * Returns null when there's nothing worth trimming.
 */
export function findContentBounds(
  gray: ArrayLike<number>,
  width: number,
  height: number,
  margin = 0.03,
): CropRect | null {
  const rows = new Uint32Array(height);
  const cols = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const gx = x < width - 1 ? Math.abs(gray[i] - gray[i + 1]) : 0;
      const gy = y < height - 1 ? Math.abs(gray[i] - gray[i + width]) : 0;
      if (Math.max(gx, gy) > 40) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const rowMin = Math.max(2, width * 0.01);
  const colMin = Math.max(2, height * 0.01);
  let top = -1, bottom = -1, left = -1, right = -1;
  for (let y = 0; y < height; y++) if (rows[y] >= rowMin) { if (top < 0) top = y; bottom = y; }
  for (let x = 0; x < width; x++) if (cols[x] >= colMin) { if (left < 0) left = x; right = x; }
  if (top < 0 || left < 0) return null;

  const x0 = Math.max(0, left / width - margin);
  const y0 = Math.max(0, top / height - margin);
  const x1 = Math.min(1, (right + 1) / width + margin);
  const y1 = Math.min(1, (bottom + 1) / height + margin);
  const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return rect.w * rect.h > 0.9 ? null : rect;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    // 'from-image' turns phone photos the right way up using their rotation tag.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

function toGray(data: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return gray;
}

function detectContent(bmp: ImageBitmap): CropRect | null {
  const scale = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return findContentBounds(toGray(data), canvas.width, canvas.height);
}

function resolveCrop(bmp: ImageBitmap, crop: CropMode): CropRect {
  if (crop === 'auto') return detectContent(bmp) ?? FULL_IMAGE;
  return crop ?? FULL_IMAGE;
}

/** Draws the cropped region onto a new canvas; `scaleFor` picks the zoom from the region's longest side. */
function drawRegion(bmp: ImageBitmap, rect: CropRect, scaleFor: (longSide: number) => number) {
  const sx = rect.x * bmp.width;
  const sy = rect.y * bmp.height;
  const sw = Math.max(1, rect.w * bmp.width);
  const sh = Math.max(1, rect.h * bmp.height);
  const scale = scaleFor(Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser could not prepare the image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Greyscale + contrast stretch. Ignores the darkest/lightest 1% so specks and glare don't set the range. */
function enhance(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const gray = toGray(d);
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  const cut = gray.length * 0.01;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < cut) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < cut) hi--;
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = ((gray[j] - lo) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Prepares an image for Tesseract: crop, rotate upright, resize so letters are roughly
 * the size Tesseract was trained on (small images are enlarged up to 3×), then greyscale
 * and boost contrast.
 */
export async function prepareForOcr(file: File, crop: CropMode): Promise<HTMLCanvasElement> {
  const bmp = await loadBitmap(file);
  try {
    const rect = resolveCrop(bmp, crop);
    const { canvas, ctx } = drawRegion(bmp, rect, (long) =>
      long < 1600 ? Math.min(3, 1600 / long) : long > 3200 ? 3200 / long : 1,
    );
    enhance(ctx, canvas.width, canvas.height);
    return canvas;
  } finally {
    bmp.close();
  }
}

/** Cuts one word (plus a little margin) out of the scanned image, enlarged so it's easy to read. */
export async function cropWordToFile(
  source: HTMLCanvasElement,
  box: { x0: number; y0: number; x1: number; y1: number },
): Promise<File> {
  const pad = Math.round((box.y1 - box.y0) * 0.35);
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(source.width, box.x1 + pad);
  const y1 = Math.min(source.height, box.y1 + pad);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const scale = Math.max(1, 120 / h);
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, x0, y0, w, h, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not crop the word');
  return new File([blob], 'word.png', { type: 'image/png' });
}

/** Crops and shrinks an image to a JPEG for the optional AI service (smaller = faster + cheaper). */
export async function prepareForUpload(
  file: File,
  crop: CropMode,
  maxSide = 1568,
): Promise<{ image: string; mediaType: 'image/jpeg' }> {
  const bmp = await loadBitmap(file);
  try {
    const rect = resolveCrop(bmp, crop);
    const { canvas } = drawRegion(bmp, rect, (long) => Math.min(1, maxSide / long));
    return { image: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mediaType: 'image/jpeg' };
  } finally {
    bmp.close();
  }
}
