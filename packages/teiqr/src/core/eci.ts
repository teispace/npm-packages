/**
 * Extended Channel Interpretation assignment numbers.
 *
 * An ECI header declares the character set of everything that follows. It is
 * genuinely useful for non-Latin text destined for a known reader, but it is
 * not a free win: readers that predate ECI, and a surprising number of cheap
 * hardware scanners, either ignore the header or refuse the symbol outright.
 *
 * Most scanners already sniff UTF-8 successfully, so this library never emits
 * an ECI header unless asked. Set `eci: ECI.UTF8` when a specific reader
 * requires the declaration.
 */
export const ECI = {
  /** ISO-8859-1. The default assumption when no header is present. */
  ISO_8859_1: 3,
  ISO_8859_2: 4,
  ISO_8859_3: 5,
  ISO_8859_4: 6,
  ISO_8859_5: 7,
  ISO_8859_6: 8,
  ISO_8859_7: 9,
  ISO_8859_8: 10,
  ISO_8859_9: 11,
  ISO_8859_13: 15,
  ISO_8859_15: 17,
  /** Shift-JIS. */
  SHIFT_JIS: 20,
  /** Windows-1250 through 1256. */
  WINDOWS_1250: 21,
  WINDOWS_1251: 22,
  WINDOWS_1252: 23,
  WINDOWS_1256: 24,
  /** UTF-16 big endian. */
  UTF16BE: 25,
  /** UTF-8. The one worth declaring in practice. */
  UTF8: 26,
  /** US-ASCII. */
  ASCII: 27,
  /** Big5. */
  BIG5: 28,
  /** GB 2312 / GBK. */
  GB18030: 29,
  /** EUC-KR. */
  EUC_KR: 30,
  /** Binary data with no character interpretation. */
  BINARY: 899,
} as const;

export type EciAssignment = (typeof ECI)[keyof typeof ECI] | number;

/** Largest assignment number the three-tier encoding can represent. */
export const MAX_ECI = 999999;

/**
 * Bit width of an ECI designator.
 *
 * The designator is self-describing through its leading bits: `0xxxxxxx` for
 * one byte, `10xxxxxx xxxxxxxx` for two, `110xxxxx xxxxxxxx xxxxxxxx` for
 * three. Assignments up to 127 therefore cost a single byte, which covers
 * every charset in {@link ECI}.
 */
export const eciWidth = (assignment: number): 8 | 16 | 24 => {
  if (assignment < 0 || assignment > MAX_ECI || !Number.isInteger(assignment)) {
    throw new RangeError(`ECI assignment out of range (0-${MAX_ECI}): ${assignment}`);
  }
  if (assignment < 128) return 8;
  if (assignment < 16384) return 16;
  return 24;
};

/** The designator value with its leading prefix bits applied. */
export const eciDesignator = (assignment: number): number => {
  const width = eciWidth(assignment);
  if (width === 8) return assignment;
  if (width === 16) return 0x8000 | assignment;
  return 0xc00000 | assignment;
};
