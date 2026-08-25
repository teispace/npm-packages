import { describe, expect, it } from 'vitest';
import { encode } from '../src/core/encode.js';
import { formatBits, penaltyScore, versionBits } from '../src/core/matrix.js';
import type { EccLevel } from '../src/core/types.js';
import {
  alignmentPatternPositions,
  eccCodewordsPerBlock,
  MAX_VERSION,
  numDataCodewords,
  numEccBlocks,
  numRawDataModules,
  sizeForVersion,
} from '../src/core/version.js';

const LEVELS: EccLevel[] = ['L', 'M', 'Q', 'H'];

describe('ISO/IEC 18004 conformance', () => {
  it('scores feature 4 as complete 5% steps in both directions', () => {
    // Table 11 feature 4: "k rates the deviation of the proportion of dark
    // modules from 50% in steps of 5%", with 0 points between 45% and 55% and
    // 10 points between 40% and 60%. That makes k the number of COMPLETE 5%
    // steps, counted symmetrically about 50%.
    //
    // This is the exact check the most-downloaded QR encoder on npm fails: it
    // rounds one side of 50% and truncates the other, so it selects a
    // different mask than the standard requires on roughly half of all
    // symbols. The loop below is the spec text, brute-forced.
    const specK = (dark: number, total: number): number => {
      const steps = Math.abs((dark * 100) / total - 50) / 5;
      return steps <= 1 ? 0 : Math.ceil(steps) - 1;
    };
    const ourK = (dark: number, total: number): number =>
      Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;

    let compared = 0;
    for (let version = 1; version <= MAX_VERSION; version++) {
      const total = sizeForVersion(version) ** 2;
      // Odd squared is always odd, so the deviation is never exactly zero and
      // `ceil(d) - 1` can never go negative.
      expect(total % 2).toBe(1);
      for (let dark = 0; dark <= total; dark++) {
        expect(ourK(dark, total)).toBe(specK(dark, total));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(400_000);
  });

  it('selects the lowest-penalty mask, matching an exhaustive search', () => {
    for (const text of ['A', 'https://example.com', '12345678901234567890', 'mixed Text 42']) {
      const auto = encode(text, { boostEcc: false });
      let bestScore = Number.POSITIVE_INFINITY;
      let bestMask = -1;
      for (let mask = 0; mask < 8; mask++) {
        const pinned = encode(text, { mask, boostEcc: false });
        const score = penaltyScore({
          size: pinned.size,
          modules: pinned.modules,
          kinds: pinned.kinds,
        });
        if (score < bestScore) {
          bestScore = score;
          bestMask = mask;
        }
      }
      expect(auto.mask).toBe(bestMask);
    }
  });

  it('produces format patterns with the BCH(15,5) minimum distance', () => {
    const all: number[] = [];
    for (const ecc of LEVELS) for (let mask = 0; mask < 8; mask++) all.push(formatBits(ecc, mask));
    expect(all).toHaveLength(32);
    expect(new Set(all).size).toBe(32);

    // The code is specified to have minimum Hamming distance 7, which is what
    // lets the decoder tolerate three bit errors in the format area.
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        let d = 0;
        for (let bit = 0; bit < 15; bit++) if (((all[i] ^ all[j]) >>> bit) & 1) d++;
        minDistance = Math.min(minDistance, d);
      }
    }
    expect(minDistance).toBe(7);
  });

  it('produces version patterns with the BCH(18,6) minimum distance', () => {
    const all: number[] = [];
    for (let v = 7; v <= MAX_VERSION; v++) all.push(versionBits(v));
    expect(new Set(all).size).toBe(all.length);

    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        let d = 0;
        for (let bit = 0; bit < 18; bit++) if (((all[i] ^ all[j]) >>> bit) & 1) d++;
        minDistance = Math.min(minDistance, d);
      }
    }
    expect(minDistance).toBe(8);
  });

  it('partitions codewords into blocks that tile exactly', () => {
    for (let version = 1; version <= MAX_VERSION; version++) {
      const total = Math.floor(numRawDataModules(version) / 8);
      for (const ecc of LEVELS) {
        const blocks = numEccBlocks(version, ecc);
        const eccPer = eccCodewordsPerBlock(version, ecc);
        const data = numDataCodewords(version, ecc);
        expect(data + blocks * eccPer).toBe(total);
        expect(data).toBeGreaterThan(0);
        // Block data lengths differ by at most one, per §7.6.
        expect(Math.floor(total / blocks) - eccPer).toBeGreaterThan(0);
      }
    }
  });

  it('places alignment patterns per the Table E.1 rules', () => {
    for (let version = 2; version <= MAX_VERSION; version++) {
      const pos = alignmentPatternPositions(version);
      const size = sizeForVersion(version);
      expect(pos).toHaveLength(Math.floor(version / 7) + 2);
      expect(pos[0]).toBe(6);
      expect(pos[pos.length - 1]).toBe(size - 7);
      // Spacing between the upper coordinates is uniform and even.
      const gaps = pos.slice(2).map((p, i) => p - pos[i + 1]);
      expect(new Set(gaps).size).toBeLessThanOrEqual(1);
      for (const g of gaps) expect(g % 2).toBe(0);
    }
  });

  it('marks exactly one permanently dark module', () => {
    const matrix = encode('dark module');
    let dark = 0;
    for (let i = 0; i < matrix.kinds.length; i++) {
      if (matrix.kinds[i] === 7 /* MODULE.DARK */) {
        dark++;
        expect(matrix.modules[i]).toBe(1);
      }
    }
    expect(dark).toBe(1);
  });

  it('boosts the error correction level for free when the version has slack', () => {
    // 'A' fits version 1 many times over, so the level should rise from M to H
    // without the symbol growing.
    const plain = encode('A', { ecc: 'M', boostEcc: false });
    const boosted = encode('A', { ecc: 'M', boostEcc: true });
    expect(boosted.version).toBe(plain.version);
    expect(boosted.ecc).toBe('H');
  });
});
