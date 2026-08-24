/**
 * Reed-Solomon decoding over GF(256).
 *
 * Encoding only needs polynomial remainder; decoding needs the full machinery,
 * because the whole point is to recover data whose error positions are
 * unknown — a logo covering part of the symbol, a scratch, a bad print. The
 * classical pipeline is: syndromes locate whether anything is wrong,
 * Berlekamp-Massey finds the error-locator polynomial, a Chien search finds
 * its roots (the error positions), and Forney's algorithm computes the
 * magnitude to XOR out at each one.
 *
 * With `n` check symbols and no side information about where the damage is,
 * `floor(n / 2)` errors are correctable. That bound is exactly what the logo
 * coverage analysis budgets against.
 */

import { inv, mul, polyEval, pow } from '../core/galois.js';

/** Raised when the damage exceeds what the check symbols can repair. */
export class UncorrectableError extends Error {
  constructor(message = 'Too many errors to correct') {
    super(message);
    this.name = 'UncorrectableError';
  }
}

/** Multiply two polynomials given in descending powers. */
const polyMul = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) out[i + j] ^= mul(a[i], b[j]);
  }
  return out;
};

/**
 * Syndromes of the received word: the codeword polynomial evaluated at each
 * of the generator's roots. An all-zero result means the word is a valid
 * codeword and needs no repair.
 */
const syndromes = (received: Uint8Array, numEcc: number): Uint8Array => {
  const out = new Uint8Array(numEcc);
  for (let i = 0; i < numEcc; i++) out[i] = polyEval(received, pow(2, i));
  return out;
};

/**
 * Berlekamp-Massey: find the shortest error-locator polynomial consistent with
 * the syndromes. Returned in descending powers.
 */
const errorLocator = (synd: Uint8Array): Uint8Array => {
  let cur = Uint8Array.from([1]);
  let prev = Uint8Array.from([1]);

  for (let i = 0; i < synd.length; i++) {
    // Discrepancy between the syndromes and what `cur` predicts.
    let delta = synd[i];
    for (let j = 1; j < cur.length; j++) {
      delta ^= mul(cur[cur.length - 1 - j], synd[i - j]);
    }

    // Shift `prev` by one power of x regardless, so it stays one step behind.
    prev = Uint8Array.from([...prev, 0]);

    if (delta !== 0) {
      if (prev.length > cur.length) {
        const scaled = prev.map((c) => mul(c, delta));
        prev = cur.map((c) => mul(c, inv(delta)));
        cur = scaled;
      }
      const adjusted = new Uint8Array(Math.max(cur.length, prev.length));
      adjusted.set(cur, adjusted.length - cur.length);
      for (let j = 0; j < prev.length; j++) {
        adjusted[adjusted.length - prev.length + j] ^= mul(prev[j], delta);
      }
      cur = adjusted;
    }
  }

  // Strip leading zeros so the degree is honest.
  let lead = 0;
  while (lead < cur.length - 1 && cur[lead] === 0) lead++;
  return cur.subarray(lead);
};

/**
 * Chien search: the error positions are the reciprocals of the locator's
 * roots. Positions are returned as indices into `received`.
 */
const errorPositions = (locator: Uint8Array, length: number): number[] => {
  const degree = locator.length - 1;
  const positions: number[] = [];

  for (let i = 0; i < length; i++) {
    // Position i corresponds to x = a^-i.
    if (polyEval(locator, pow(2, -i)) === 0) positions.push(length - 1 - i);
  }

  if (positions.length !== degree) {
    throw new UncorrectableError(
      `Error locator has degree ${degree} but ${positions.length} roots were found`,
    );
  }
  return positions;
};

/** Formal derivative of a polynomial in descending powers. */
const derivative = (poly: Uint8Array): Uint8Array => {
  const degree = poly.length - 1;
  const out = new Uint8Array(degree);
  for (let i = 0; i < degree; i++) {
    // In characteristic 2 every even-power term differentiates away.
    const power = degree - i;
    out[i] = power % 2 === 1 ? poly[i] : 0;
  }
  return out;
};

/**
 * Correct `received` in place and return the number of symbols repaired.
 *
 * `numEcc` is the count of check symbols at the tail of `received`. Throws
 * {@link UncorrectableError} when the damage exceeds `floor(numEcc / 2)`.
 */
export const correct = (received: Uint8Array, numEcc: number): number => {
  const synd = syndromes(received, numEcc);
  if (synd.every((s) => s === 0)) return 0;

  // Syndromes are computed low-power-first; the locator machinery wants them
  // that way, but the evaluator polynomial below works in descending powers.
  const locator = errorLocator(synd);
  const positions = errorPositions(locator, received.length);

  if (positions.length > numEcc >> 1) {
    throw new UncorrectableError(
      `${positions.length} errors exceeds the ${numEcc >> 1} this block can correct`,
    );
  }

  // Forney: magnitude at each position is -evaluator(x) / derivative(x).
  const syndPoly = Uint8Array.from([...synd].reverse());
  const evaluator = polyMul(syndPoly, locator).subarray(-numEcc);
  const locatorPrime = derivative(locator);

  for (const position of positions) {
    const xInv = pow(2, -(received.length - 1 - position));
    const num = polyEval(evaluator, xInv);
    const den = polyEval(locatorPrime, xInv);
    if (den === 0) throw new UncorrectableError('Forney denominator vanished');
    // The extra factor of x compensates for the evaluator truncation above.
    received[position] ^= mul(num, inv(mul(den, xInv)));
  }

  // Re-check: a false locator can produce a word that is still not a codeword.
  if (!syndromes(received, numEcc).every((s) => s === 0)) {
    throw new UncorrectableError('Correction did not produce a valid codeword');
  }

  return positions.length;
};
