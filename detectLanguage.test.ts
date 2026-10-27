import { describe, expect, it } from 'vitest';
import { suggestLanguage } from './detectLanguage';

describe('suggestLanguage', () => {
  it('suggests the language whose writing system the text is in', () => {
    expect(suggestLanguage('欢迎光临我们的商店今天打折', 'eng', 80)).toEqual({ suggest: 'chi_sim' });
    expect(suggestLanguage('مرحبا بكم في متجرنا اليوم', 'spa', 80)).toEqual({ suggest: 'ara' });
    expect(suggestLanguage('आज हमारी दुकान में आपका स्वागत है', 'eng', 80)).toEqual({ suggest: 'hin' });
  });

  it('tells Spanish from English', () => {
    expect(suggestLanguage('Bienvenidos a la tienda de la ciudad, abierto todos los días', 'eng', 85)).toEqual({ suggest: 'spa' });
    expect(suggestLanguage('Welcome to the shop in the old town, open all week', 'spa', 85)).toEqual({ suggest: 'eng' });
  });

  it('stays quiet when the language already fits', () => {
    expect(suggestLanguage('Welcome to the shop in the old town', 'eng', 85)).toBeNull();
    expect(suggestLanguage('Hi', 'spa', 20)).toBeNull();
  });

  it('flags nonsense at very low confidence without naming a language', () => {
    expect(suggestLanguage('xq vrr tlkk pqm zzt', 'eng', 25)).toEqual({});
  });
});
