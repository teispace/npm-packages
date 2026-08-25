import { sanitizeFilename } from '../export/filename.js';
import { getPayloadType, type PayloadValues } from '../payload/index.js';
import type { CsvTable } from './csv.js';

/** Column names that name the output file rather than feeding a field. */
const NAME_COLUMNS = ['name', 'filename', 'file', 'label', 'id'];

export type BatchRow = {
  /** 1-based row number as it appears in the spreadsheet, for error messages. */
  line: number;
  values: PayloadValues;
  filename: string;
  /** Missing required fields, if any. */
  missing: string[];
};

export type BatchPlan = {
  typeId: string;
  rows: BatchRow[];
  /** Headers that matched a field on the content type. */
  matched: string[];
  /** Headers that were ignored, so the user can see a typo. */
  ignored: string[];
  /** Column used for filenames, if one was found. */
  nameColumn: string | null;
};

const normalise = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

/**
 * Map spreadsheet columns onto a content type's fields.
 *
 * Matching is case- and separator-insensitive, so `Network Name`, `network_name`
 * and `networkname` all reach the same field. Anything unmatched is reported
 * rather than silently dropped — a mistyped header would otherwise produce five
 * hundred codes missing a field, with no indication why.
 */
export interface BatchOptions {
  /**
   * Fill fields the sheet does not supply from the payload type's sample data.
   *
   * Off by default, and deliberately so. It is convenient in an interactive
   * editor with a live preview, where a half-filled form should still render
   * something. In a headless batch it is dangerous: a CSV missing its `ssid`
   * column would produce five hundred codes that all silently point at the
   * sample network. With this off, those rows come back with a populated
   * `missing` array instead, and the caller decides what to do.
   */
  fillFromSample?: boolean;
}

export const planBatch = (
  typeId: string,
  table: CsvTable,
  options: BatchOptions = {},
): BatchPlan => {
  const type = getPayloadType(typeId);
  if (!type) {
    return { typeId, rows: [], matched: [], ignored: table.headers, nameColumn: null };
  }

  // Each field answers to several names: its own key, its label, the label
  // without any parenthetical, and the parenthetical alone. A column headed
  // `Network Name`, `SSID` or `Network name (SSID)` should all find the same
  // field, because all three are what people actually type.
  const byNormalised = new Map<string, string>();
  const alias = (key: string, field: string) => {
    const normalised = normalise(key);
    if (normalised && !byNormalised.has(normalised)) byNormalised.set(normalised, field);
  };

  for (const field of type.fields) {
    alias(field.name, field.name);
    alias(field.label, field.name);
    alias(field.label.replace(/\([^)]*\)/g, ''), field.name);
    const parenthetical = field.label.match(/\(([^)]*)\)/)?.[1];
    if (parenthetical) alias(parenthetical, field.name);
  }

  const matched: string[] = [];
  const ignored: string[] = [];
  let nameColumn: string | null = null;
  const columnToField = new Map<number, string>();

  table.headers.forEach((header, index) => {
    const key = normalise(header);
    const field = byNormalised.get(key);
    if (field) {
      columnToField.set(index, field);
      matched.push(header);
      return;
    }
    if (nameColumn === null && NAME_COLUMNS.includes(key)) {
      nameColumn = header;
      columnToField.set(index, '__name__');
      return;
    }
    ignored.push(header);
  });

  const required = type.fields.filter((f) => f.required).map((f) => f.name);

  const rows: BatchRow[] = table.rows.map((cells, rowIndex) => {
    const values: PayloadValues = {};
    let name = '';

    cells.forEach((cell, columnIndex) => {
      const field = columnToField.get(columnIndex);
      if (!field) return;
      if (field === '__name__') name = cell.trim();
      else values[field] = cell;
    });

    if (options.fillFromSample) {
      for (const [key, value] of Object.entries(type.sample)) {
        if (values[key] === undefined && value !== undefined) values[key] = value;
      }
    }

    const missing = required.filter((field) => !(values[field] ?? '').trim());

    return {
      // +2: one for the header row, one because spreadsheets count from 1.
      line: rowIndex + 2,
      values,
      filename: sanitizeFilename(name || `${type.label}-${rowIndex + 1}`),
      missing,
    };
  });

  return { typeId, rows, matched, ignored, nameColumn };
};

/** Ensure no two entries in an archive collide. */
export const uniqueFilenames = (names: string[]): string[] => {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}-${count + 1}`;
  });
};
