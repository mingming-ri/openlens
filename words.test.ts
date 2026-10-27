import { describe, expect, it } from 'vitest';
import { alternativesFor, applyChoice, findUnsureWords, replaceToken } from './words';

describe('alternativesFor', () => {
  it('puts the engine’s own alternatives first and never repeats the original', () => {
    const alts = alternativesFor({
      text: 'Heilo',
      confidence: 40,
      choices: [{ text: 'Heilo', confidence: 40 }, { text: 'Hello', confidence: 35 }],
    });
    expect(alts[0]).toBe('Hello');
    expect(alts).not.toContain('Heilo');
    expect(alts.length).toBeLessThanOrEqual(4);
  });

  it('fixes digits mixed into words', () => {
    expect(alternativesFor({ text: 'C00L', confidence: 30 })[0]).toBe('COOL');
    expect(alternativesFor({ text: 'he1lo', confidence: 30 })[0]).toBe('hello');
  });

  it('offers tidy casing for jumbled bubble-letter case', () => {
    expect(alternativesFor({ text: 'sAlE', confidence: 30 })).toContain('SALE');
  });

  it('swaps commonly confused shapes', () => {
    expect(alternativesFor({ text: 'rnore', confidence: 30 })).toContain('more');
  });
});

describe('content type', () => {
  it('offers only letter readings in words-only mode and digit readings in numbers-only mode', () => {
    expect(alternativesFor({ text: 'l', confidence: 30 }, 'words').every((a) => !/\d/.test(a))).toBe(true);
    expect(alternativesFor({ text: '1O', confidence: 30 }, 'numbers')).toContain('10');
  });

  it('underlines unsure numbers unless the image is words only', () => {
    const words = [{ text: '1O', confidence: 30 }];
    expect(Object.keys(findUnsureWords('1O', words, 'numbers'))).toEqual(['0']);
    expect(findUnsureWords('10', [{ text: '10', confidence: 30 }], 'words')).toEqual({});
  });
});

describe('findUnsureWords', () => {
  it('maps low-confidence words to their position in the text', () => {
    const text = 'Big SAIE today\n\nC0me in';
    const words = [
      { text: 'Big', confidence: 95 },
      { text: 'SAIE', confidence: 41 },
      { text: 'today', confidence: 90 },
      { text: 'C0me', confidence: 50 },
      { text: 'in', confidence: 92 },
    ];
    const unsure = findUnsureWords(text, words);
    expect(Object.keys(unsure).map(Number)).toEqual([1, 3]);
    expect(unsure[3].options).toContain('Come');
  });

  it('handles missing word data', () => {
    expect(findUnsureWords('Hello', undefined)).toEqual({});
  });
});

describe('replaceToken / applyChoice', () => {
  it('keeps line breaks and spacing', () => {
    expect(replaceToken('a b\n\nc', 2, 'see').text).toBe('a b\n\nsee');
  });

  it('shifts later choices when a word becomes two', () => {
    const base = { original: 'x', chosen: 'x', options: [], confidence: 30, bbox: null };
    const choices = { 0: { ...base, token: 0 }, 2: { ...base, token: 2 } };
    const r = applyChoice('aa bb cc', choices, 0, 'a a');
    expect(r.text).toBe('a a bb cc');
    expect(Object.keys(r.choices).map(Number)).toEqual([0, 3]);
    expect(r.choices[0].chosen).toBe('a a');
  });
});
