'use client';

import { useRef } from 'react';
import { encode } from '../core/encode.js';
import type { QrInput, QrMatrix } from '../core/types.js';
import type { QrOptions } from '../index.js';
import { buildScene, type Scene } from '../render/scene.js';
import type { QrStyle } from '../render/types.js';

export interface QrCodeResult {
  readonly matrix: QrMatrix;
  readonly scene: Scene;
}

/** A structural digest of the inputs, so inline object literals still hit the cache. */
const stableKey = (value: QrInput, options: QrOptions): string => {
  const input =
    typeof value === 'string'
      ? value
      : value instanceof Uint8Array
        ? `b:${Array.from(value).join(',')}`
        : `s:${JSON.stringify(value)}`;
  // Sorted keys, so `{ ecc, gap }` and `{ gap, ecc }` produce the same digest.
  const opts = JSON.stringify(options, Object.keys(options).sort());
  return `${input} ${opts}`;
};

const build = (value: QrInput, options: QrOptions): QrCodeResult => {
  const { ecc, minVersion, maxVersion, mask, boostEcc, eci, kanji, ...style } = options;
  const matrix = encode(value, { ecc, minVersion, maxVersion, mask, boostEcc, eci, kanji });
  return { matrix, scene: buildScene(matrix, style as Partial<QrStyle>) };
};

/**
 * Encode and lay out a code, recomputing only when the inputs actually change.
 *
 * Encoding a large symbol is real work — Reed-Solomon across dozens of blocks
 * plus eight mask trials — so a naive component redoing it on every parent
 * render is noticeably slow.
 *
 * `useMemo` keyed on `[value, options]` would not help, because the overwhelmingly
 * common call site passes an object literal:
 *
 * ```tsx
 * <QrCode value={url} moduleShape="rounded" />   // a fresh options object every render
 * ```
 *
 * Object identity changes every time, so the memo would miss every time. This
 * caches on a structural digest of the inputs instead. Caching during render is
 * safe here because {@link build} is pure: the same inputs always produce the
 * same output, and the ref is only ever a performance shortcut — React may
 * discard it at any point and the result would be identical.
 */
export const useQrCode = (value: QrInput, options: QrOptions = {}): QrCodeResult => {
  const key = stableKey(value, options);
  const cache = useRef<{ key: string; result: QrCodeResult } | null>(null);

  if (cache.current?.key !== key) {
    cache.current = { key, result: build(value, options) };
  }
  return cache.current.result;
};
