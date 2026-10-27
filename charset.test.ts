import { describe, expect, it } from 'vitest';
import { fitsType, fixCharacters, tesseractParams } from './charset';

describe('tesseractParams', () => {
  it('blocks digits for words, allows only digits for numbers, and clears both for mixed', () => {
    expect(tesseractParams('words').tessedit_char_blacklist).toContain('1');
    expect(tesseractParams('numbers').tessedit_char_whitelist).toContain('7');
    expect(tesseractParams('numbers').tessedit_char_whitelist).not.toContain('I');
    expect(tesseractParams('mixed')).toEqual({ tessedit_char_whitelist: '', tessedit_char_blacklist: '' });
  });
});

describe('fixCharacters', () => {
  it('words only: turns digits into letters, matching the case', () => {
    expect(fixCharacters('1 L0VE P1ZZA', 'words')).toBe('I LOVE PIZZA');
    expect(fixCharacters('he1lo w0rld', 'words')).toBe('hello world');
  });

  it('numbers only: turns lookalike letters into digits', () => {
    expect(fixCharacters('$1O.5O', 'numbers')).toBe('$10.50');
    expect(fixCharacters('O7l2 345', 'numbers')).toBe('0712 345');
  });

  it('mixed: fixes "1" used as "I" in English without touching real numbers', () => {
    expect(fixCharacters('1 am here', 'mixed')).toBe('I am here');
    expect(fixCharacters("1'm late", 'mixed')).toBe("I'm late");
    expect(fixCharacters('Buy 1 get 1 free', 'mixed')).toBe('Buy 1 get 1 free');
    expect(fixCharacters('Room 1 was full', 'mixed')).toBe('Room 1 was full');
  });

  it('mixed: fixes characters sandwiched between the other kind', () => {
    expect(fixCharacters('H1GH 2O24', 'mixed')).toBe('HIGH 2024');
    expect(fixCharacters('MP3 A4 1st', 'mixed')).toBe('MP3 A4 1st');
  });

  it('fixes symbols mistaken for letters', () => {
    expect(fixCharacters('he|lo $ALE', 'mixed')).toBe('hello SALE');
    expect(fixCharacters('| am', 'mixed')).toBe('I am');
    expect(fixCharacters('$ALE €XIT', 'words')).toBe('SALE EXIT');
    expect(fixCharacters('me@site.com $5', 'mixed')).toBe('me@site.com $5');
    expect(fixCharacters('S10.99', 'numbers')).toBe('$10.99');
  });

  it('keeps line breaks', () => {
    expect(fixCharacters('1 am\n\nC00L', 'words')).toBe('I am\n\nCOOL');
  });
});

describe('fixCase', () => {
  it('tidies random capitals inside words', () => {
    expect(fixCharacters('la cAsA es hOla', 'mixed', 'spa')).toBe('la casa es hola');
    expect(fixCharacters('BIG SALe', 'mixed')).toBe('BIG SALE');
    expect(fixCharacters('eI perro', 'mixed', 'spa')).toBe('el perro');
    expect(fixCharacters('Ia casa y Ios perros', 'mixed', 'spa')).toBe('la casa y los perros');
  });

  it('leaves normal casing and names alone', () => {
    expect(fixCharacters('Hola Madrid NASA iPhone McDonald', 'mixed', 'spa')).toBe('Hola Madrid NASA iPhone McDonald');
  });
});

describe('fitsType', () => {
  it('filters readings by type', () => {
    expect(fitsType('l', 'words')).toBe(true);
    expect(fitsType('1', 'words')).toBe(false);
    expect(fitsType('1', 'numbers')).toBe(true);
    expect(fitsType('I', 'numbers')).toBe(false);
  });
});
