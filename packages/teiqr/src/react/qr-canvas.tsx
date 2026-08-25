'use client';

import { type CanvasHTMLAttributes, type ReactElement, type Ref, useEffect, useRef } from 'react';
import type { QrInput } from '../core/types.js';
import type { QrOptions } from '../index.js';
import { rasterizeScene } from '../raster/scene-raster.js';
import { splitProps } from './split-props.js';
import { useQrCode } from './use-qr-code.js';

/** Canvas attributes this component forwards, minus the ones it owns itself. */
type CanvasAttributes = Omit<
  CanvasHTMLAttributes<HTMLCanvasElement>,
  'children' | 'width' | 'height' | 'ref' | keyof QrOptions
>;

export interface QrCanvasProps extends QrOptions, CanvasAttributes {
  value: QrInput;
  /** Rendered size in CSS pixels. */
  size?: number;
  /**
   * Device pixel ratio to render at. Defaults to the display's own, so the
   * code is sharp on retina screens without the caller doing anything.
   */
  pixelRatio?: number;
  /** Accessible name. Without one the canvas is hidden from assistive technology. */
  title?: string;
  ref?: Ref<HTMLCanvasElement>;
}

/**
 * A QR code drawn to a `<canvas>`.
 *
 * Prefer {@link QrCode} unless you specifically need a canvas — SVG scales
 * cleanly, renders on the server, and is smaller. A canvas is the right choice
 * when you are compositing the code into other canvas content, or when you
 * need `toDataURL` from the element itself.
 *
 * ### Sharp on retina by default
 * The standard failure of canvas-based QR components is blurriness on
 * high-density displays: they size the backing store in CSS pixels, so the
 * browser upscales a 256×256 bitmap onto 512×512 physical pixels and the module
 * edges smear. Some libraries document this and tell you to handle sizing
 * yourself. Here the backing store is sized in device pixels and the CSS size
 * set separately, so it is correct without any caller involvement.
 *
 * Pixels are produced by this package's own rasteriser and written with
 * `putImageData`, so the canvas output is identical to the PNG output rather
 * than a second, subtly different drawing path.
 */
export const QrCanvas = ({
  value,
  size = 256,
  pixelRatio,
  title,
  ref,
  ...rest
}: QrCanvasProps): ReactElement => {
  const { options, dom } = splitProps<CanvasAttributes>(rest);
  const { scene } = useQrCode(value, options);
  const internalRef = useRef<HTMLCanvasElement | null>(null);

  const aspect = scene.height / scene.width;
  const cssHeight = Math.round(size * aspect);

  useEffect(() => {
    const canvas = internalRef.current;
    if (!canvas) return;

    // `devicePixelRatio` is read inside the effect, never during render: it is
    // a browser-only value, and touching it while rendering would produce
    // different markup on the server and cause a hydration mismatch.
    const ratio =
      pixelRatio ??
      (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);

    const { pixels, width, height } = rasterizeScene(scene, {
      width: Math.round(size * ratio),
    });

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${cssHeight}px`;

    const context = canvas.getContext('2d');
    if (!context) return;
    // Clear first: a smaller code drawn over a larger previous one would
    // otherwise leave the old edges visible around it.
    context.clearRect(0, 0, width, height);
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  }, [scene, size, cssHeight, pixelRatio]);

  return (
    <canvas
      ref={(node) => {
        internalRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as { current: HTMLCanvasElement | null }).current = node;
      }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...dom}
    />
  );
};
