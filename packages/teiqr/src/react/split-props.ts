'use client';

import type { QrOptions } from '../index.js';

/**
 * Keys that configure the code rather than the host element.
 *
 * Listed once so both components partition their props the same way. Without
 * this, a `moduleShape` attribute leaks onto the DOM element (a React warning
 * and an invalid attribute) or an `onClick` leaks into the encoder's memo key
 * and defeats it.
 */
export const QR_OPTION_KEYS = [
  'ecc',
  'minVersion',
  'maxVersion',
  'mask',
  'boostEcc',
  'eci',
  'kanji',
  'moduleShape',
  'eyeFrame',
  'eyeBall',
  'body',
  'eyeFrameFill',
  'eyeBallFill',
  'background',
  'quietZone',
  'cornerRadius',
  'moduleSize',
  'gap',
  'logo',
  'frame',
] as const satisfies ReadonlyArray<keyof QrOptions>;

const QR_OPTION_SET: ReadonlySet<string> = new Set<string>(QR_OPTION_KEYS);

/**
 * Partition props into code options and host-element attributes.
 *
 * `TDom` is supplied by the caller so the forwarded half keeps its precise
 * element prop type; returning a bare `Record<string, unknown>` would widen it
 * and fail to spread onto a typed JSX element.
 */
export const splitProps = <TDom>(
  props: Record<string, unknown>,
): { options: QrOptions; dom: TDom } => {
  const options: Record<string, unknown> = {};
  const dom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (QR_OPTION_SET.has(key)) options[key] = value;
    else dom[key] = value;
  }
  return { options: options as QrOptions, dom: dom as TDom };
};
