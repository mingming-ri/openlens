import { describe, expect, it } from 'vitest';
import { findContentBounds, formatBytes, MAX_FILE_BYTES, validateImageFile } from './image';

function makeFile(name: string, type: string, size?: number): File {
  const file = new File(['data'], name, { type });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateImageFile', () => {
  it('accepts common image types', () => {
    expect(validateImageFile(makeFile('a.png', 'image/png')).ok).toBe(true);
    expect(validateImageFile(makeFile('a.jpg', 'image/jpeg')).ok).toBe(true);
  });

  it('rejects non-images, empty and oversized files', () => {
    expect(validateImageFile(makeFile('notes.pdf', 'application/pdf')).ok).toBe(false);
    expect(validateImageFile(makeFile('empty.png', 'image/png', 0)).ok).toBe(false);
    expect(validateImageFile(makeFile('huge.png', 'image/png', MAX_FILE_BYTES + 1)).ok).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('findContentBounds (automatic crop)', () => {
  const W = 100, H = 100;

  it('finds a dark block on a plain background', () => {
    const gray = new Uint8Array(W * H).fill(255);
    for (let y = 40; y < 60; y++) for (let x = 30; x < 70; x++) gray[y * W + x] = 0;
    const r = findContentBounds(gray, W, H)!;
    expect(r).not.toBeNull();
    expect(r.x).toBeLessThanOrEqual(0.3);
    expect(r.x + r.w).toBeGreaterThanOrEqual(0.7);
    expect(r.y).toBeLessThanOrEqual(0.4);
    expect(r.y + r.h).toBeGreaterThanOrEqual(0.6);
    expect(r.w * r.h).toBeLessThan(0.3);
  });

  it('returns null for a blank image', () => {
    expect(findContentBounds(new Uint8Array(W * H).fill(200), W, H)).toBeNull();
  });
});
