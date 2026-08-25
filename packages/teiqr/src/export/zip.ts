/**
 * A minimal ZIP writer, for shipping a batch of codes as one download.
 *
 * Synchronous and dependency-free. The portfolio implementation this grew from
 * was async because it leaned on `CompressionStream`; since this package
 * carries its own DEFLATE, entries can be compressed inline and the whole
 * archive built in one pass.
 *
 * Only what a batch export needs: stored or deflated entries, no encryption,
 * no Zip64. Archives above 4 GB or 65,535 entries are rejected rather than
 * silently truncated, because a ZIP that overflows its central directory
 * fields opens as "corrupt" with no explanation.
 */

import { deflateRaw } from '../raster/deflate.js';
import { crc32 } from '../raster/png.js';

export interface ZipEntry {
  /** Path inside the archive. Forward slashes, no leading slash. */
  readonly name: string;
  readonly data: Uint8Array | string;
  /**
   * Skip compression for this entry. Worth setting for already-compressed
   * payloads such as PNG, where DEFLATE costs time and saves nothing.
   */
  readonly store?: boolean;
}

/** ZIP's own limits, past which the format needs Zip64. */
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

const encoder = new TextEncoder();

const toBytes = (data: Uint8Array | string): Uint8Array =>
  typeof data === 'string' ? encoder.encode(data) : data;

/** Little-endian writers; every ZIP field is little-endian. */
const u16 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];

/**
 * Convert a Date to the MS-DOS date and time fields ZIP still uses.
 *
 * The epoch is 1980 and seconds have two-second resolution. Timestamps before
 * 1980 cannot be represented and are clamped, which is better than wrapping
 * into a date that reads as 2043.
 */
const dosDateTime = (date: Date): { date: number; time: number } => {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1),
  };
};

export interface ZipOptions {
  /**
   * Modification time stamped on every entry. Defaults to the epoch start
   * (1980-01-01) rather than "now", so building the same archive twice
   * produces identical bytes — which makes output diffable and cacheable.
   */
  modifiedAt?: Date;
  /** DEFLATE effort, 0-9. */
  level?: number;
}

/**
 * Build a ZIP archive.
 *
 * @example
 * const zip = createZip([
 *   { name: 'codes/a.png', data: toPng(a), store: true },
 *   { name: 'codes/b.svg', data: renderSvg(b).svg },
 * ]);
 */
export const createZip = (entries: readonly ZipEntry[], options: ZipOptions = {}): Uint8Array => {
  if (entries.length > MAX_ENTRIES) {
    throw new RangeError(
      `ZIP supports at most ${MAX_ENTRIES} entries without Zip64; got ${entries.length}`,
    );
  }

  const { modifiedAt = new Date(Date.UTC(1980, 0, 1)), level = 6 } = options;
  const { date, time } = dosDateTime(modifiedAt);

  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const raw = toBytes(entry.data);
    const checksum = crc32(raw);

    // Only keep the compressed form when it is actually smaller; DEFLATE can
    // expand incompressible input, and a stored entry is always valid.
    const compressed = entry.store ? null : deflateRaw(raw, level);
    const useDeflate = compressed !== null && compressed.length < raw.length;
    const payload = useDeflate ? (compressed as Uint8Array) : raw;
    const method = useDeflate ? 8 : 0;

    if (raw.length > MAX_SIZE || payload.length > MAX_SIZE) {
      throw new RangeError(`Entry "${entry.name}" exceeds the 4 GB ZIP limit`);
    }

    const header = [
      ...u32(0x04034b50), // local file header signature
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(method),
      ...u16(time),
      ...u16(date),
      ...u32(checksum),
      ...u32(payload.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0), // extra field length
    ];

    central.push(
      ...u32(0x02014b50), // central directory signature
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0),
      ...u16(method),
      ...u16(time),
      ...u16(date),
      ...u32(checksum),
      ...u32(payload.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attributes
      ...u32(0), // external attributes
      ...u32(offset),
      ...nameBytes,
    );

    local.push(...header, ...nameBytes, ...payload);
    offset += header.length + nameBytes.length + payload.length;
  }

  const end = [
    ...u32(0x06054b50), // end of central directory
    ...u16(0), // disk number
    ...u16(0), // disk with central directory
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0), // comment length
  ];

  return Uint8Array.from([...local, ...central, ...end]);
};

export { crc32 };
