import { describe, expect, it } from 'vitest';
import { cleanOcrText, countWords, describeStatus, splitIntoChunks, toParagraphs } from './text';

describe('cleanOcrText', () => {
  it('normalises line endings, trailing spaces and large gaps', () => {
    expect(cleanOcrText('  Hello  \r\nworld\n\n\n\nBye  ')).toBe('Hello\nworld\n\nBye');
  });
});

describe('countWords', () => {
  it('counts words and handles empty text', () => {
    expect(countWords('one two\nthree')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});

describe('splitIntoChunks', () => {
  it('returns nothing for empty text', () => {
    expect(splitIntoChunks('  ')).toEqual([]);
  });

  it('splits at sentence boundaries and respects the limit', () => {
    const text = 'First sentence here. Second sentence here. Third sentence here.';
    const chunks = splitIntoChunks(text, 45);
    expect(chunks).toEqual(['First sentence here. Second sentence here.', 'Third sentence here.']);
  });

  it('splits a very long sentence by words without losing any', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const chunks = splitIntoChunks(words.join(' '), 50);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(50));
    expect(chunks.join(' ')).toBe(words.join(' '));
  });
});

describe('toParagraphs', () => {
  it('splits paragraphs into sentences with a running index', () => {
    const p = toParagraphs('One. Two?\nStill two!\n\nThree');
    expect(p).toMatchObject([
      [
        { text: 'One.', index: 0 },
        { text: 'Two?', index: 1 },
        { text: 'Still two!', index: 2 },
      ],
      [{ text: 'Three', index: 3 }],
    ]);
  });

  it('understands Chinese, Hindi and Arabic sentence endings', () => {
    expect(toParagraphs('你好。再见。')[0].map((s) => s.text)).toEqual(['你好。', '再见。']);
    expect(toParagraphs('नमस्ते। धन्यवाद।')[0]).toHaveLength(2);
    expect(toParagraphs('كيف حالك؟ بخير')[0]).toHaveLength(2);
  });

  it('tracks each word’s position across paragraphs', () => {
    const p = toParagraphs('One two. Three\n\nFour');
    expect(p.flat().flatMap((s) => s.words)).toEqual([
      { text: 'One', token: 0 },
      { text: 'two.', token: 1 },
      { text: 'Three', token: 2 },
      { text: 'Four', token: 3 },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(toParagraphs(' \n\n ')).toEqual([]);
  });
});

describe('describeStatus', () => {
  it('maps known statuses and falls back for unknown ones', () => {
    expect(describeStatus('recognizing text')).toMatch(/reading the image/i);
    expect(describeStatus('preparing image')).toMatch(/cleaning up/i);
    expect(describeStatus('something new')).toBe('Working…');
  });
});

describe('Chinese text', () => {
  it('removes the spaces and line breaks Tesseract adds between Chinese characters', () => {
    expect(cleanOcrText('你 被 关 在 一 个\n小 房 间 里 。')).toBe('你被关在一个小房间里。');
  });
  it('keeps spacing in mixed text and counts each character as a word', () => {
    expect(cleanOcrText('Hello 你好 world')).toBe('Hello 你好 world');
    expect(countWords('你好 world')).toBe(3);
  });
});
