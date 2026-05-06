export type FaviconShape = 'square' | 'rounded' | 'circle' | 'squircle';
export type FaviconFit = 'contain' | 'cover' | 'clip';

export interface FaviconOptions {
  source: string;
  outDir: string;
  force: boolean;
  dryRun: boolean;

  emitIcon: boolean;
  emitApple: boolean;
  emitOg: boolean;
  emitTwitter: boolean;
  ogSource?: string;

  pwa: boolean;
  pwaInit: boolean;

  shape: FaviconShape;
  radius: number;
  bg: string;
  padding: number;
  fit: FaviconFit;

  icoSizes: number[];
  quality: number;
}

export interface FaviconWriteResult {
  path: string;
  bytes: number;
  skipped?: boolean;
}

export interface FaviconRunResult {
  outputs: FaviconWriteResult[];
  pwaSnippet?: string;
}
