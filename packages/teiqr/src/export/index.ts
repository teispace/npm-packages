/**
 * One call, any format.
 *
 * Every format serialises from the same {@link Scene}, so the geometry is
 * generated once and cannot drift between SVG, PDF, EPS and PNG. All of it is
 * synchronous and dependency-free.
 */

import type { QrMatrix } from '../core/types.js';
import { encodePng, type PngOptions } from '../raster/png.js';
import { type RasterOptions, rasterize } from '../raster/scene-raster.js';
import { buildScene, type Scene } from '../render/scene.js';
import { sceneToSvg } from '../render/svg.js';
import type { QrStyle } from '../render/types.js';
import { sceneToEps } from './eps.js';
import { sanitizeFilename } from './filename.js';
import { embedImages, groundUnderLogo } from './image.js';
import { sceneToPdf } from './pdf.js';

export type ExportFormat = 'svg' | 'png' | 'pdf' | 'eps';

export interface FormatInfo {
  readonly id: ExportFormat;
  readonly label: string;
  readonly extension: string;
  readonly mime: string;
  readonly vector: boolean;
  readonly note: string;
}

export const EXPORT_FORMATS: readonly FormatInfo[] = [
  {
    id: 'svg',
    label: 'SVG',
    extension: 'svg',
    mime: 'image/svg+xml',
    vector: true,
    note: 'Editable vector. Best for web and design tools. The only format that renders frame label text and non-PNG logos.',
  },
  {
    id: 'png',
    label: 'PNG',
    extension: 'png',
    mime: 'image/png',
    vector: false,
    note: 'Transparency supported. Produced without a canvas, so it works identically on a server.',
  },
  {
    id: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mime: 'application/pdf',
    vector: true,
    note: 'Print-ready vector at a real physical size. Keeps logo transparency through a soft mask.',
  },
  {
    id: 'eps',
    label: 'EPS',
    extension: 'eps',
    mime: 'application/postscript',
    vector: true,
    note: 'For older print workflows. Full colour; logo transparency is flattened onto the background.',
  },
];

const BY_ID = new Map(EXPORT_FORMATS.map((f) => [f.id, f]));

/** Metadata for a format, or undefined when the id is unknown. */
export const getFormat = (id: string): FormatInfo | undefined => BY_ID.get(id as ExportFormat);

export interface ExportOptions extends RasterOptions, PngOptions {
  /** Physical side length for PDF and EPS, in millimetres. */
  sideMm?: number;
  /** Document title recorded in PDF metadata and the EPS header. */
  title?: string;
}

/** The bytes of an exported code, plus what it is. */
export interface ExportResult {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly extension: string;
  /** Scene features the chosen format could not represent. */
  readonly omitted: readonly string[];
}

const encoder = new TextEncoder();

/**
 * Render a symbol in any supported format.
 *
 * Returns bytes rather than a `Blob` so the same call works in Node, where
 * `Blob` is awkward, and in a Worker, where you usually want to stream the
 * bytes straight into a `Response`.
 *
 * @example
 * const { bytes, mime } = exportQr(matrix, { moduleShape: 'rounded' }, 'pdf', { sideMm: 40 });
 * await writeFile('code.pdf', bytes);
 */
export const exportQr = (
  matrix: QrMatrix,
  style: Partial<QrStyle>,
  format: ExportFormat,
  options: ExportOptions = {},
): ExportResult => {
  const info = BY_ID.get(format);
  if (!info) {
    throw new RangeError(
      `Unknown export format: ${format}. Expected one of ${EXPORT_FORMATS.map((f) => f.id).join(', ')}.`,
    );
  }

  const scene = buildScene(matrix, style);

  switch (format) {
    case 'svg':
      return {
        bytes: encoder.encode(sceneToSvg(scene).svg),
        mime: `${info.mime};charset=utf-8`,
        extension: info.extension,
        omitted: [],
      };

    case 'pdf': {
      // A soft mask carries the logo's own transparency, so nothing is
      // composited here and semi-transparent edges stay clean.
      const images = embedImages(scene);
      return {
        bytes: sceneToPdf(scene, { sideMm: options.sideMm, title: options.title, images }),
        mime: info.mime,
        extension: info.extension,
        omitted: missingImages(scene, images.size),
      };
    }

    case 'eps': {
      const images = embedImages(scene, { flattenOver: groundUnderLogo(scene) });
      return {
        bytes: encoder.encode(
          sceneToEps(scene, { sideMm: options.sideMm, title: options.title, images }),
        ),
        mime: `${info.mime};charset=utf-8`,
        extension: info.extension,
        omitted: missingImages(scene, images.size),
      };
    }

    default: {
      const { pixels, width, height, omitted } = rasterize(matrix, style, options);
      return {
        bytes: encodePng(pixels, width, height, options),
        mime: info.mime,
        extension: info.extension,
        omitted,
      };
    }
  }
};

/** Report logos the vector writers could not decode, rather than dropping them silently. */
const missingImages = (scene: Scene, embedded: number): string[] => {
  const total = new Set(
    scene.items.filter((item) => item.kind === 'image').map((item) => item.href),
  ).size;
  return total > embedded
    ? [`${total - embedded} logo(s) could not be embedded (only PNG data URIs are decodable)`]
    : [];
};

/** `stem` sanitised and given the format's extension. */
export const exportFilename = (stem: string, format: ExportFormat): string =>
  `${sanitizeFilename(stem)}.${BY_ID.get(format)?.extension ?? format}`;

export { type EpsOptions, sceneToEps } from './eps.js';
export { sanitizeFilename } from './filename.js';
export {
  ascii85,
  type EmbeddedImage,
  type EmbedOptions,
  embedImages,
  groundUnderLogo,
  packImage,
} from './image.js';
export { type PdfOptions, sceneToPdf } from './pdf.js';
export { crc32, createZip, type ZipEntry, type ZipOptions } from './zip.js';
