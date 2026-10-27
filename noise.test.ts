import { describe, expect, it } from 'vitest';
import { isNoiseLine, removeNoise } from './noise';

describe('noise removal', () => {
  it('flags symbol-heavy, low-confidence lines', () => {
    expect(isNoiseLine({ text: '~=| ®% ^', confidence: 40 })).toBe(true);
    expect(isNoiseLine({ text: 'a i ~ l', confidence: 30 })).toBe(true);
    expect(isNoiseLine({ text: 'x', confidence: 12 })).toBe(true);
  });

  it('keeps real text, even when it was hard to read', () => {
    expect(isNoiseLine({ text: 'GRAND OPENING SALE', confidence: 48 })).toBe(false);
    expect(isNoiseLine({ text: 'Open 9:00-17:00', confidence: 80 })).toBe(false);
    expect(isNoiseLine({ text: '你 被 关 在 一 个', confidence: 45 })).toBe(false);
  });

  it('removes noise lines and stray symbols, keeping the rest', () => {
    const text = '~=| ®%\nWelcome to the shop |\nOpen daily';
    const lines = [
      { text: '~=| ®%', confidence: 30 },
      { text: 'Welcome to the shop |', confidence: 88 },
      { text: 'Open daily', confidence: 91 },
    ];
    const words = [
      { text: 'Welcome', confidence: 90 },
      { text: '|', confidence: 20 },
    ];
    const r = removeNoise(text, lines, words);
    expect(r.text).toBe('Welcome to the shop\nOpen daily');
    expect(r.words.map((w) => w.text)).toEqual(['Welcome']);
  });
});
