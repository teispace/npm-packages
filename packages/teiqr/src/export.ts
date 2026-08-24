/**
 * `teiqr/export` — every output format, from one scene.
 *
 * SVG, PNG, PDF and EPS all serialise from the same device-independent
 * geometry, so they cannot drift apart. Plus a ZIP writer and CSV-driven batch
 * planning, for producing many codes at once.
 *
 * All synchronous, all dependency-free — including PDF and EPS logo embedding,
 * which uses this package's own PNG decoder rather than a canvas.
 */

export {
  type BatchOptions,
  type BatchPlan,
  type BatchRow,
  planBatch,
  uniqueFilenames,
} from './batch/batch.js';
export {
  type CsvTable,
  escapeCsvValue,
  parseCsv,
  sniffDelimiter,
  toCsv,
} from './batch/csv.js';
export {
  ascii85,
  crc32,
  createZip,
  type EmbeddedImage,
  type EmbedOptions,
  type EpsOptions,
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportOptions,
  type ExportResult,
  embedImages,
  exportFilename,
  exportQr,
  type FormatInfo,
  getFormat,
  groundUnderLogo,
  type PdfOptions,
  packImage,
  sanitizeFilename,
  sceneToEps,
  sceneToPdf,
  type ZipEntry,
  type ZipOptions,
} from './export/index.js';
