/**
 * Escaping rules for the payload formats. These are the details that decide
 * whether a code works on a real phone: an unescaped `;` in a WiFi password
 * silently truncates the credential, and an unfolded 200-character vCard line
 * is rejected outright by some contact importers.
 */

/**
 * WiFi network strings (the `WIFI:` scheme) delimit on `;` and `:`, so those
 * plus `,`, `"` and the escape character itself have to be backslash-escaped.
 */
export const escapeWifi = (value: string): string => value.replace(/([\\;,:"])/g, '\\$1');

/** vCard / MeCard text values, per RFC 6350 §3.4. */
export const escapeVCard = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** MeCard reserves a different, smaller set than vCard. */
export const escapeMeCard = (value: string): string => value.replace(/([\\;:,])/g, '\\$1');

/**
 * Fold a content line to 75 octets, per RFC 6350 §3.2. Continuation lines start
 * with a single space. Folding counts UTF-8 bytes, not characters, and must not
 * split a multi-byte sequence.
 */
export const foldLine = (line: string): string => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let bytes = 0;
  // The first line allows 75 octets, continuations 74 plus the leading space.
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  if (current) out.push(current);

  return out.join('\r\n ');
};

/** Assemble vCard content lines with CRLF separators and folding. */
export const vcardLines = (lines: (string | null)[]): string =>
  `${lines
    .filter((l): l is string => l !== null && l !== '')
    .map(foldLine)
    .join('\r\n')}\r\n`;

/**
 * Percent-encode a query parameter. `encodeURIComponent` leaves `!'()*`
 * unescaped, which some mail clients mis-parse inside a mailto body.
 */
export const encodeParam = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** Build a query string, dropping empty values. */
export const query = (params: Record<string, string | undefined>): string => {
  const parts = Object.entries(params)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([k, v]) => `${k}=${encodeParam(v)}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
};

/** Strip everything a dialler ignores, keeping a leading `+`. */
export const normalizePhone = (value: string): string => {
  const trimmed = value.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/[^0-9]/g, '');
};

/** Add a scheme when the user typed a bare domain. */
export const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

/** `YYYY-MM-DDTHH:mm` from a datetime-local input to iCalendar basic format. */
export const toICalDate = (value: string, allDay = false): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const [date, time] = trimmed.split('T');
  const compactDate = date.replace(/-/g, '');
  if (allDay || !time) return compactDate;
  return `${compactDate}T${time.replace(/:/g, '').padEnd(6, '0')}`;
};

// ---------------------------------------------------------------------------
// Inverses, for reading an existing code back into fields
// ---------------------------------------------------------------------------

/** Inverse of {@link escapeWifi}. */
export const unescapeWifi = (value: string): string => value.replace(/\\([;,:"])/g, '$1');

/** Inverse of {@link escapeVCard}. */
export const unescapeVCard = (value: string): string =>
  value.replace(/\\n/gi, '\n').replace(/\\([\\,;])/g, '$1');

/** Inverse of {@link escapeMeCard}. */
export const unescapeMeCard = (value: string): string => value.replace(/\\([;:,])/g, '$1');

/**
 * Undo RFC 6350 line folding, then split into content lines.
 *
 * Folded continuations start with a single space or tab, and must be rejoined
 * before any line can be interpreted — a naive `split('\r\n')` turns a folded
 * 200-character NOTE into three unrelated, unparseable lines.
 */
export const unfoldLines = (text: string): string[] =>
  text
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.length > 0);

/** `YYYYMMDD` or `YYYYMMDDTHHmmss` back to the `datetime-local` shape. */
export const fromICalDate = (value: string): string => {
  const trimmed = value.trim();
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/.exec(trimmed);
  if (!match) return trimmed;
  const [, y, m, d, hh, mm] = match;
  return hh ? `${y}-${m}-${d}T${hh}:${mm}` : `${y}-${m}-${d}`;
};
