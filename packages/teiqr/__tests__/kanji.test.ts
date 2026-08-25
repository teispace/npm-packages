import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { isKanjiAvailable } from '../src/core/kanji-registry.js';
import { planSegments } from '../src/core/segment.js';
import { kanjiTableSize } from '../src/kanji.js';
import { decodeMatrix } from '../src/verify/decode-matrix.js';

describe('Kanji mode', () => {
  it('registers a table on import', () => {
    expect(isKanjiAvailable()).toBe(true);
    expect(kanjiTableSize()).toBe(6953);
  });

  it('round trips Japanese text through Kanji mode', () => {
    for (const text of ['こんにちは世界', '日本語のテキストです', '株式会社テイスペース']) {
      const matrix = encode(text, { kanji: true });
      const result = decodeMatrix(matrix);
      expect(result.segments.some((s) => s.mode === 'kanji')).toBe(true);
      expect(result.text).toBe(text);
    }
  });

  it('produces a smaller symbol than UTF-8 byte mode', () => {
    // The whole point: 13 bits per character instead of 24.
    const text = '日本語のテキストをエンコードするテストです。漢字モードは大幅に小さくなります。';
    const withKanji = encode(text, { kanji: true, ecc: 'M', boostEcc: false });
    const withoutKanji = encode(text, { kanji: false, ecc: 'M', boostEcc: false });
    expect(withKanji.version).toBeLessThan(withoutKanji.version);
    expect(decodeMatrix(withKanji).text).toBe(text);
    expect(decodeMatrix(withoutKanji).text).toBe(text);
  });

  it('mixes Kanji with other modes where that is cheaper', () => {
    const text = '注文番号 12345678901234567890 です';
    const plan = planSegments(text, 1, true);
    const modes = new Set(plan.segments.map((s) => s.mode));
    expect(modes.size).toBeGreaterThan(1);
    expect(decodeMatrix(encode(text, { kanji: true })).text).toBe(text);
  });

  it('falls back to byte mode for characters with no Shift-JIS mapping', () => {
    // Emoji have no Shift-JIS representation, so they must route to byte mode
    // without breaking the surrounding Kanji run.
    const text = '世界🎉です';
    const result = decodeMatrix(encode(text, { kanji: true }));
    expect(result.text).toBe(text);
  });

  it('ignores the kanji flag entirely for Latin text', () => {
    const withFlag = encode('hello world', { kanji: true, boostEcc: false });
    const without = encode('hello world', { kanji: false, boostEcc: false });
    expect(withFlag.version).toBe(without.version);
    expect(Array.from(withFlag.modules)).toEqual(Array.from(without.modules));
  });
});
