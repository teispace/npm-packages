/**
 * `teiqr/render` — styling and SVG output.
 *
 * Pure string building: no DOM, no canvas, so it runs on a server, in a
 * Worker, or in the browser unchanged.
 */

export { eyeBallPath, eyeFramePath, eyeOrigins } from './render/eyes.js';
export { escapeAttr, hashString, type Paint, resolvePaint } from './render/gradient.js';
export { type LogoGeometry, logoGeometry, touchesFinder } from './render/logo.js';
export {
  EYE_BALL_SAFETY,
  EYE_FRAME_SAFETY,
  MODULE_SHAPE_SAFETY,
  SAFETY_EVIDENCE,
  SAFETY_NOTE,
  type ScanSafety,
  styleSafety,
} from './render/safety.js';
export { buildScene, LABEL_HEIGHT, type Scene, type SceneItem } from './render/scene.js';
export { bodyPath, circlePath, roundedRect, superellipsePath } from './render/shapes.js';
export { type RenderResult, renderSvg, sceneToSvg } from './render/svg.js';
export {
  CONNECTED_SHAPES,
  DEFAULT_FRAME,
  DEFAULT_STYLE,
  type EyeBallShape,
  type EyeFrameShape,
  type Fill,
  type FrameOptions,
  type FrameStyle,
  type GradientStop,
  type LogoOptions,
  type ModuleShape,
  type QrStyle,
} from './render/types.js';
