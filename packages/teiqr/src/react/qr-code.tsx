'use client';

import type { ReactElement, Ref, SVGProps } from 'react';
import type { QrInput } from '../core/types.js';
import type { QrOptions } from '../index.js';
import { formatNumber as n, sceneToElements } from './scene-elements.js';
import { splitProps } from './split-props.js';
import { useQrCode } from './use-qr-code.js';

/** SVG attributes this component forwards, minus the ones it owns itself. */
type SvgAttributes = Omit<
  SVGProps<SVGSVGElement>,
  'children' | 'width' | 'height' | 'ref' | keyof QrOptions
>;

export interface QrCodeProps extends QrOptions, SvgAttributes {
  /** What to encode: text, binary, or pre-built segments. */
  value: QrInput;
  /**
   * Rendered size in CSS pixels, applied to both axes. Omit to let the SVG
   * scale to its container, which is usually what you want in a layout.
   */
  size?: number;
  /** Accessible name. Without one the code is hidden from assistive technology. */
  title?: string;
  ref?: Ref<SVGSVGElement>;
}

/**
 * A QR code as an SVG element.
 *
 * Real React elements, not an injected string — so it reconciles normally,
 * accepts refs and event handlers on the element, and renders identically on
 * the server with no hydration mismatch.
 *
 * Unlike the common React QR wrappers this is not limited to text: `value`
 * accepts a `Uint8Array` for binary payloads or hand-built segments, and every
 * styling option is available.
 *
 * @example
 * <QrCode value="https://example.com" size={256} title="Link to example.com" />
 * @example
 * <QrCode value={bytes} ecc="H" moduleShape="rounded" eyeFrame="circle" />
 */
export const QrCode = ({ value, size, title, ref, ...rest }: QrCodeProps): ReactElement => {
  const { options, dom } = splitProps<SvgAttributes>(rest);
  const { scene } = useQrCode(value, options);

  const { defs, before, inCode, after, viewBox } = sceneToElements(scene);
  // Frames with a label band are taller than they are wide, so the height has
  // to follow the scene's own aspect rather than being assumed square.
  const aspect = scene.height / scene.width;

  // Typed as plain SVG attributes, not CSSProperties: spreading a style type
  // as element props would pull the whole CSS property set into the element's
  // prop type and collide with SVG's own presentation attributes.
  const dimensions: { width?: number; height?: number } =
    size === undefined ? {} : { width: size, height: Math.round(size * aspect) };

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      shapeRendering="geometricPrecision"
      // A code with no accessible name is decorative as far as assistive
      // technology is concerned; one with a title should be announced.
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...dimensions}
      {...dom}
    >
      {title ? <title>{title}</title> : null}
      {defs.length > 0 ? <defs>{defs}</defs> : null}
      {before}
      <g transform={`translate(${n(scene.codeOffset.x)},${n(scene.codeOffset.y)})`}>{inCode}</g>
      {after}
    </svg>
  );
};

export { QR_OPTION_KEYS } from './split-props.js';
