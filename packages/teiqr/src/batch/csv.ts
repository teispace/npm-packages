export type CsvTable = {
  headers: string[];
  rows: string[][];
  delimiter: string;
};

const CANDIDATES = [',', ';', '\t', '|'];

/**
 * Guess the delimiter from the first line.
 *
 * Spreadsheets in European locales export semicolons, and anything containing
 * addresses or decimal numbers will have commas inside quoted fields. Counting
 * only unquoted separators is what makes the guess reliable.
 */
export const sniffDelimiter = (text: string): string => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;

  for (const candidate of CANDIDATES) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }

  return best;
};

/**
 * RFC 4180 CSV reader.
 *
 * Written by hand rather than split on commas because the fields people
 * actually paste — addresses, vCard notes, URLs with query strings — routinely
 * contain the delimiter, quotes and newlines. A naive split silently produces
 * wrong codes rather than an error, which is the worst possible failure for a
 * batch of five hundred.
 */
export const parseCsv = (text: string, delimiter?: string): CsvTable => {
  const source = text.replace(/^﻿/, ''); // strip a spreadsheet BOM
  const sep = delimiter ?? sniffDelimiter(source);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    // Skip records that are entirely empty — trailing newlines are normal.
    if (record.some((value) => value.length > 0)) records.push(record);
    record = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === sep) {
      endField();
    } else if (char === '\n') {
      endRecord();
    } else if (char === '\r') {
      // Handled by the \n that follows; a lone \r also ends the record.
      if (source[i + 1] !== '\n') endRecord();
    } else {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) endRecord();

  const [headerRow = [], ...rest] = records;
  return {
    headers: headerRow.map((h) => h.trim()),
    rows: rest,
    delimiter: sep,
  };
};

/** Quote a value for CSV output, if it needs it. */
export const escapeCsvValue = (value: string, delimiter = ','): string =>
  /["\n\r]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;

export const toCsv = (headers: string[], rows: string[][], delimiter = ','): string =>
  [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvValue(cell, delimiter)).join(delimiter))
    .join('\r\n');
