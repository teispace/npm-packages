import { describe, expect, it } from 'vitest';
import { blockLayout, encode } from '../src/core/encode.js';
import { dataModuleSequence } from '../src/core/matrix.js';
import type { QrMatrix } from '../src/core/types.js';
import { decodeMatrix, UncorrectableError } from '../src/verify/decode-matrix.js';

/** Flip every module belonging to the given interleaved codeword indices. */
const damageCodewords = (matrix: QrMatrix, codewords: Iterable<number>): QrMatrix => {
  const modules = Uint8Array.from(matrix.modules);
  const order = dataModuleSequence(matrix.size, matrix.kinds);
  const targets = new Set(codewords);
  for (let bit = 0; bit < order.length; bit++) {
    if (targets.has(bit >>> 3)) modules[order[bit]] ^= 1;
  }
  return { ...matrix, modules };
};

/** Codeword indices belonging to one Reed-Solomon block, in stream order. */
const codewordsOfBlock = (matrix: QrMatrix, block: number): number[] => {
  const layout = blockLayout(matrix.version, matrix.ecc);
  const out: number[] = [];
  for (let i = 0; i < layout.totalCodewords; i++) {
    if (layout.ownerOfCodeword[i] === block) out.push(i);
  }
  return out;
};

describe('Reed-Solomon recovery', () => {
  it('repairs damage up to the per-block budget and reports how much', () => {
    const text = 'https://example.com/a-reasonably-long-url-for-testing';
    const matrix = encode(text, { ecc: 'H', boostEcc: false });
    const layout = blockLayout(matrix.version, matrix.ecc);
    const budget = layout.correctablePerBlock;
    expect(budget).toBeGreaterThan(0);

    const block0 = codewordsOfBlock(matrix, 0);
    const damaged = damageCodewords(matrix, block0.slice(0, budget));

    const result = decodeMatrix(damaged);
    expect(result.text).toBe(text);
    expect(result.corrected).toBe(budget);
  });

  it('refuses to guess once damage exceeds the budget', () => {
    const matrix = encode('short payload', { ecc: 'L', boostEcc: false });
    const layout = blockLayout(matrix.version, matrix.ecc);
    const block0 = codewordsOfBlock(matrix, 0);
    // One past the limit: the decoder must fail loudly, never return wrong text.
    const damaged = damageCodewords(matrix, block0.slice(0, layout.correctablePerBlock + 1));

    expect(() => decodeMatrix(damaged)).toThrow(UncorrectableError);
  });

  it('survives damage spread thinly across every block that would kill one block', () => {
    // The industry rule of thumb treats damage as a single percentage of the
    // symbol. It is not: the same number of damaged codewords is recoverable
    // when spread and fatal when concentrated. This pins that distinction.
    const text = 'https://example.com/spread-versus-concentrated-damage-demo';
    const matrix = encode(text, { ecc: 'Q', boostEcc: false });
    const layout = blockLayout(matrix.version, matrix.ecc);
    expect(layout.numBlocks).toBeGreaterThan(1);

    const perBlock = layout.correctablePerBlock;
    const spread: number[] = [];
    for (let b = 0; b < layout.numBlocks; b++) {
      spread.push(...codewordsOfBlock(matrix, b).slice(0, perBlock));
    }
    // Total damage far exceeds one block's budget, yet every block is at its limit.
    expect(spread.length).toBe(perBlock * layout.numBlocks);
    expect(decodeMatrix(damageCodewords(matrix, spread)).text).toBe(text);

    // The same count concentrated into one block is unrecoverable.
    const concentrated = codewordsOfBlock(matrix, 0).slice(0, perBlock + 1);
    expect(concentrated.length).toBeLessThan(spread.length);
    expect(() => decodeMatrix(damageCodewords(matrix, concentrated))).toThrow(UncorrectableError);
  });

  it('recovers from format-information damage within the BCH limit', () => {
    const matrix = encode('format bch', { ecc: 'Q', boostEcc: false });
    const modules = Uint8Array.from(matrix.modules);
    // Flip three bits of the first format copy — the documented BCH(15,5) limit.
    modules[0 * matrix.size + 8] ^= 1;
    modules[1 * matrix.size + 8] ^= 1;
    modules[2 * matrix.size + 8] ^= 1;

    const result = decodeMatrix({ ...matrix, modules }, { trustHeader: false });
    expect(result.ecc).toBe('Q');
    expect(result.mask).toBe(matrix.mask);
    expect(result.text).toBe('format bch');
  });
});
