export type ModuleShape =
  | 'square'
  | 'dot'
  | 'rounded'
  | 'extra-rounded'
  | 'classy'
  | 'diamond'
  | 'star'
  | 'vertical'
  | 'horizontal'
  | 'fluid';

export type EyeFrameShape = 'square' | 'rounded' | 'circle' | 'leaf' | 'cut' | 'dotted';

export type EyeBallShape = 'square' | 'dot' | 'rounded' | 'leaf' | 'diamond';

export type GradientStop = { offset: number; color: string };

export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; stops: GradientStop[]; angle: number }
  | { kind: 'radial'; stops: GradientStop[] };

export type LogoOptions = {
  /**
   * Image source. Must be a data URI: an artifact that reaches for the network
   * at render time is not self-contained, and exported SVGs would break the
   * moment they left the machine that made them.
   */
  href: string;
  /** Logo width as a fraction of the code's width. */
  sizeRatio: number;
  /** Cleared margin around the logo, in modules. */
  padding: number;
  shape: 'square' | 'rounded' | 'circle';
  /**
   * Clear the modules behind the logo instead of drawing over them. Removing
   * them is honest — those codewords are lost either way — and it stops
   * half-hidden modules from confusing a scanner's binariser.
   */
  excavate: boolean;
  /** Plate colour behind the logo. `null` leaves the code's background showing. */
  background: string | null;
};

export type FrameStyle = 'none' | 'box' | 'label-bottom' | 'label-top';

export type FrameOptions = {
  style: FrameStyle;
  text: string;
  textColor: string;
  background: string;
  /** Border thickness in modules. 0 draws the label with no surrounding border. */
  border: number;
  cornerRadius: number;
  fontFamily: string;
};

export type QrStyle = {
  moduleShape: ModuleShape;
  eyeFrame: EyeFrameShape;
  eyeBall: EyeBallShape;
  body: Fill;
  /** Falls back to `body` when omitted. */
  eyeFrameFill?: Fill;
  eyeBallFill?: Fill;
  /** `null` renders no background rect at all, leaving the code transparent. */
  background: Fill | null;
  /** Quiet zone width in modules. The spec requires 4; below that, scanners struggle. */
  quietZone: number;
  /** Rounding of the whole code's background, in modules. */
  cornerRadius: number;
  /** Output pixel size of one module. Only affects width/height, not the viewBox. */
  moduleSize: number;
  /**
   * Shrink each module slightly so neighbours don't touch. 0 is flush, 0.1 is a
   * hairline gap. Ignored by the connected shapes, which need to touch.
   */
  gap?: number;
  logo?: LogoOptions;
  frame?: FrameOptions;
};

export const DEFAULT_STYLE: QrStyle = {
  moduleShape: 'square',
  eyeFrame: 'square',
  eyeBall: 'square',
  body: { kind: 'solid', color: '#000000' },
  background: { kind: 'solid', color: '#ffffff' },
  quietZone: 4,
  cornerRadius: 0,
  moduleSize: 8,
  gap: 0,
};

export const DEFAULT_FRAME: FrameOptions = {
  style: 'label-bottom',
  text: 'SCAN ME',
  textColor: '#ffffff',
  background: '#000000',
  border: 1,
  cornerRadius: 2,
  fontFamily: 'Helvetica, Arial, sans-serif',
};

/** Shapes whose look depends on merging with their neighbours. */
export const CONNECTED_SHAPES: ModuleShape[] = ['fluid', 'vertical', 'horizontal'];
