import { stat } from 'node:fs/promises';
import path from 'node:path';

const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.avif'];

export interface SourceInfo {
  absolutePath: string;
  ext: string;
  bytes: number;
  isVector: boolean;
}

export const validateSource = async (source: string): Promise<SourceInfo> => {
  if (!source) throw new Error('Source image path is required (use --path).');

  const absolutePath = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(absolutePath);
  } catch {
    throw new Error(`Source image not found: ${absolutePath}`);
  }
  if (!info.isFile()) throw new Error(`Source is not a file: ${absolutePath}`);

  const ext = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_EXTS.includes(ext)) {
    throw new Error(`Unsupported source format '${ext}'. Use one of: ${SUPPORTED_EXTS.join(', ')}`);
  }

  return { absolutePath, ext, bytes: info.size, isVector: ext === '.svg' };
};

export const isHexColor = (value: string): boolean =>
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);

export const normalizeBg = (value: string): string => {
  if (value === 'transparent') return value;
  if (isHexColor(value)) return value;
  // Allow CSS named colors as-is — sharp accepts them via composite over a flat layer.
  return value;
};

export const parseSizes = (raw: string | undefined, fallback: number[]): number[] => {
  if (!raw) return fallback;
  const sizes = raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 1024);
  if (sizes.length === 0) {
    throw new Error(`Invalid --sizes value: '${raw}'. Provide comma-separated positive integers.`);
  }
  return sizes;
};
