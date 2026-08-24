'use client';

/**
 * `teiqr/react` — components and hooks.
 *
 * Everything here is a client module: the components render fine on a server
 * (SVG output is deterministic and hydrates cleanly), but the scanner needs a
 * camera and the canvas component needs a DOM, so the entry carries a
 * `'use client'` directive for the Next.js App Router.
 *
 * ```tsx
 * import { QrCode, useQrScanner } from 'teiqr/react';
 *
 * <QrCode value="https://example.com" size={256} title="Example" />
 * ```
 */

export { QrCanvas, type QrCanvasProps } from './react/qr-canvas.js';
export { QrCode, type QrCodeProps } from './react/qr-code.js';
export { type SceneElements, sceneToElements } from './react/scene-elements.js';
export { useQrCode } from './react/use-qr-code.js';
export {
  type QrScannerState,
  type UseQrScannerOptions,
  useQrScanner,
} from './react/use-qr-scanner.js';
