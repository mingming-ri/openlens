import { describe, expect, it } from 'vitest';
import { parseWordList, rankReadings, smartFix, wordKey } from './smart';
import { findUnsureWords } from './words';

const dict = parseWordList(['the 100', 'more 90', 'come 80', 'hello 70', 'sale 60', 'big 50', 'in 40', 'cool 30'].join('\n'));

describe('smart fixing', () => {
  it('strips punctuation and case for lookups', () => {
    expect(wordKey('“Hello,”')).toBe('hello');
  });

  it('ranks real, common words first', () => {
    expect(rankReadings(dict, ['rnore', 'cool', 'more'])).toEqual(['more', 'cool', 'rnore']);
  });

  it('switches an unsure non-word to the real word, keeping the scanned one as a choice', () => {
    const text = 'Big SAIE today\n\nC0me in';
    const unsure = findUnsureWords(text, [
      { text: 'Big', confidence: 95 },
      { text: 'SAIE', confidence: 41 },
      { text: 'today', confidence: 90 },
      { text: 'C0me', confidence: 50 },
      { text: 'in', confidence: 92 },
    ]);
    const r = smartFix(text, unsure, dict);
    expect(r.text).toBe('Big SALE today\n\nCome in');
    expect(r.fixed).toBe(2);
    expect(r.choices[1]).toMatchObject({ original: 'SAIE', chosen: 'SALE', auto: true });
  });

  it('fixes confident words with a digit or symbol stuck inside', () => {
    expect(smartFix('he|lo there', {}, dict).text).toBe('hello there');
    expect(smartFix('$ALE now', {}, dict).text).toBe('SALE now');
  });

  it('leaves real words, names and numbers alone', () => {
    expect(smartFix('the Bjorn 42 MP3', {}, dict).text).toBe('the Bjorn 42 MP3');
  });
});
