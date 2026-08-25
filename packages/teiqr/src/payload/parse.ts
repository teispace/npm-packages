/**
 * Read an existing QR payload back into structured fields.
 *
 * The exact inverse of the serialisers, and the piece that makes cloning
 * practical: scan an old code, get its fields, change what you want, and
 * re-render it in a new style without retyping a WiFi password or a vCard by
 * hand.
 *
 * ```ts
 * const { text } = scan(oldPng);
 * const parsed = parsePayload(text);            // { type: 'wifi', values: { ssid, password, … } }
 * const fresh = qr(serializePayload(parsed.type, { ...parsed.values, password: 'new' }),
 *                  { moduleShape: 'rounded' });
 * ```
 *
 * Every parser is round-trip tested against its own serialiser, so
 * `serialize(parse(serialize(v))) === serialize(v)` holds for all built-in
 * types.
 */

import {
  fromICalDate,
  unescapeMeCard,
  unescapeVCard,
  unescapeWifi,
  unfoldLines,
} from './escape.js';
import { getPayloadType } from './index.js';
import { profileUrlPattern, SOCIAL_NETWORKS } from './social.js';
import type { PayloadValues } from './types.js';

/** A recognised payload, decomposed into the fields its type declares. */
export interface ParsedPayload {
  /** Payload type id, matching {@link getPayloadType}. */
  readonly type: string;
  /** Human-readable name of the type. */
  readonly label: string;
  /** Field values, keyed as the type's `fields` declare and ready to re-serialise. */
  readonly values: PayloadValues;
  /** The original string, unchanged. */
  readonly raw: string;
  /**
   * `exact` when the payload carries an unambiguous scheme or header
   * (`WIFI:`, `BEGIN:VCARD`, `mailto:`); `heuristic` when the type was
   * inferred from a URL's shape, which can be wrong for lookalike links.
   */
  readonly confidence: 'exact' | 'heuristic';
}

/**
 * One format's reader. Registered parsers are tried in order, so more specific
 * formats must be registered before more general ones.
 */
export interface PayloadParser {
  readonly type: string;
  /** Return field values, or `null` when this parser does not recognise the text. */
  parse(text: string): PayloadValues | null;
  readonly confidence?: 'exact' | 'heuristic';
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Split on unescaped occurrences of `separator`. */
const splitUnescaped = (text: string, separator: string): string[] => {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      current += text[i] + text[i + 1];
      i++;
    } else if (text[i] === separator) {
      out.push(current);
      current = '';
    } else {
      current += text[i];
    }
  }
  out.push(current);
  return out;
};

/** Parse a URL's query string into a plain record, or `{}` if it has none. */
const queryParams = (text: string): Record<string, string> => {
  const index = text.indexOf('?');
  if (index === -1) return {};
  const out: Record<string, string> = {};
  for (const pair of text.slice(index + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? '' : pair.slice(eq + 1);
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      out[key] = value;
    }
  }
  return out;
};

/** Drop empty values, so a re-serialised payload matches the original. */
const compact = (values: Record<string, string | undefined>): PayloadValues => {
  const out: PayloadValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
};

/** Content lines of a vCard/iCalendar body, split into name, params and value. */
interface ContentLine {
  readonly name: string;
  readonly params: string;
  readonly value: string;
}

const contentLines = (text: string): ContentLine[] =>
  unfoldLines(text).flatMap((line) => {
    const colon = line.indexOf(':');
    if (colon === -1) return [];
    const head = line.slice(0, colon);
    const semi = head.indexOf(';');
    return [
      {
        name: (semi === -1 ? head : head.slice(0, semi)).toUpperCase(),
        params: semi === -1 ? '' : head.slice(semi + 1).toUpperCase(),
        value: line.slice(colon + 1),
      },
    ];
  });

// ---------------------------------------------------------------------------
// Parsers, most specific first
// ---------------------------------------------------------------------------

const wifiParser: PayloadParser = {
  type: 'wifi',
  parse(text) {
    if (!/^WIFI:/i.test(text)) return null;
    const body = text.slice(5).replace(/;;\s*$/, '');
    const values: Record<string, string> = {};
    for (const field of splitUnescaped(body, ';')) {
      const colon = field.indexOf(':');
      if (colon === -1) continue;
      const key = field.slice(0, colon).toUpperCase();
      const value = unescapeWifi(field.slice(colon + 1));
      // Keys are the single letters the WIFI: scheme defines.
      if (key === 'T') values.encryption = value;
      else if (key === 'S') values.ssid = value;
      else if (key === 'P') values.password = value;
      else if (key === 'E') values.eapMethod = value;
      else if (key === 'I') values.identity = value;
      else if (key === 'PH2') values.phase2 = value;
      else if (key === 'H') values.hidden = value.toLowerCase();
    }
    if (!values.ssid) return null;
    // The serialiser defaults an absent T to WPA, so record it explicitly.
    values.encryption ||= 'WPA';
    return compact(values);
  },
};

/** vCard 3.0 and 4.0 share a body; only the VERSION line and TEL scheme differ. */
const vcardParser = (type: 'vcard' | 'vcard4', version: string): PayloadParser => ({
  type,
  parse(text) {
    if (!/^BEGIN:VCARD/i.test(text.trim())) return null;
    const lines = contentLines(text);
    if (!lines.some((l) => l.name === 'VERSION' && l.value.trim() === version)) return null;

    const values: Record<string, string> = {};
    const stripTel = (value: string) => value.replace(/^tel:/i, '');

    for (const { name, params, value } of lines) {
      const text_ = unescapeVCard(value);
      switch (name) {
        case 'N': {
          // Structured name: family;given;additional;prefix;suffix
          const parts = splitUnescaped(value, ';').map(unescapeVCard);
          if (parts[0]) values.lastName = parts[0];
          if (parts[1]) values.firstName = parts[1];
          break;
        }
        case 'ORG':
          values.org = text_;
          break;
        case 'TITLE':
          values.title = text_;
          break;
        case 'TEL':
          if (params.includes('CELL')) values.mobile = stripTel(text_);
          else values.phone = stripTel(text_);
          break;
        case 'EMAIL':
          values.email = text_;
          break;
        case 'URL':
          values.url = text_;
          break;
        case 'NOTE':
          values.note = text_;
          break;
        case 'ADR': {
          // ;;street;city;region;postcode;country
          const parts = splitUnescaped(value, ';').map(unescapeVCard);
          if (parts[2]) values.street = parts[2];
          if (parts[3]) values.city = parts[3];
          if (parts[4]) values.region = parts[4];
          if (parts[5]) values.postcode = parts[5];
          if (parts[6]) values.country = parts[6];
          break;
        }
        default:
          break;
      }
    }
    return Object.keys(values).length > 0 ? compact(values) : null;
  },
});

const mecardParser: PayloadParser = {
  type: 'mecard',
  parse(text) {
    if (!/^MECARD:/i.test(text)) return null;
    const body = text.slice(7).replace(/;;\s*$/, '');
    const values: Record<string, string> = {};
    for (const field of splitUnescaped(body, ';')) {
      const colon = field.indexOf(':');
      if (colon === -1) continue;
      const key = field.slice(0, colon).toUpperCase();
      // Compound fields split on the *raw* text and unescape each part once.
      // Unescaping first and splitting after runs the values through
      // `unescapeMeCard` twice, which was invisible while it ignored
      // backslashes and turns `\\` into nothing once it stops.
      const raw = field.slice(colon + 1);
      const value = unescapeMeCard(raw);
      if (key === 'N') {
        const [last, first] = splitUnescaped(raw, ',').map(unescapeMeCard);
        if (last) values.lastName = last;
        if (first) values.firstName = first;
      } else if (key === 'TEL') {
        // The serialiser emits mobile first, then work phone, as two TEL
        // entries; fill them in that order so a re-serialise matches.
        if (values.mobile === undefined) values.mobile = value;
        else values.phone = value;
      } else if (key === 'EMAIL') values.email = value;
      else if (key === 'ORG') values.org = value;
      else if (key === 'URL') values.url = value;
      else if (key === 'NOTE') values.note = value;
      else if (key === 'ADR') {
        const [street, city, country] = splitUnescaped(raw, ',').map(unescapeMeCard);
        if (street) values.street = street;
        if (city) values.city = city;
        if (country) values.country = country;
      }
    }
    return Object.keys(values).length > 0 ? compact(values) : null;
  },
};

const eventParser: PayloadParser = {
  type: 'event',
  parse(text) {
    if (!/BEGIN:VEVENT/i.test(text)) return null;
    const values: Record<string, string> = {};
    let allDay = false;
    for (const { name, params, value } of contentLines(text)) {
      const text_ = unescapeVCard(value);
      if (name === 'SUMMARY') values.summary = text_;
      else if (name === 'LOCATION') values.location = text_;
      else if (name === 'DESCRIPTION') values.description = text_;
      else if (name === 'DTSTART') {
        values.start = fromICalDate(value);
        if (params.includes('VALUE=DATE')) allDay = true;
      } else if (name === 'DTEND') values.end = fromICalDate(value);
    }
    if (allDay) values.allDay = 'true';
    return values.summary || values.start ? compact(values) : null;
  },
};

const mailtoParser: PayloadParser = {
  type: 'email',
  parse(text) {
    if (!/^mailto:/i.test(text)) return null;
    const withoutScheme = text.slice(7);
    const params = queryParams(withoutScheme);
    const to = decodeURIComponent(withoutScheme.split('?')[0]);
    return compact({
      to,
      subject: params.subject,
      body: params.body,
      cc: params.cc,
      bcc: params.bcc,
    });
  },
};

const smsParser: PayloadParser = {
  type: 'sms',
  parse(text) {
    const match = /^(?:SMSTO|smsto|sms):([^:?]*)(?::(.*))?$/s.exec(text);
    if (!match) return null;
    return compact({ phone: match[1], message: match[2] });
  },
};

const telParser: PayloadParser = {
  type: 'phone',
  parse(text) {
    const match = /^tel:(.+)$/i.exec(text.trim());
    return match ? compact({ phone: match[1] }) : null;
  },
};

const facetimeParser: PayloadParser = {
  type: 'facetime',
  parse(text) {
    const match = /^facetime(?:-audio)?:(.+)$/i.exec(text.trim());
    return match ? compact({ target: match[1] }) : null;
  },
};

const geoParser: PayloadParser = {
  type: 'geo',
  parse(text) {
    const match = /^geo:(-?[\d.]+),(-?[\d.]+)/i.exec(text.trim());
    if (!match) return null;
    const params = queryParams(text);
    // A label rides along as `q=lat,lng(Label)`.
    const label = /\(([^)]*)\)\s*$/.exec(params.q ?? '')?.[1];
    return compact({ lat: match[1], lng: match[2], label });
  },
};

/**
 * Convert a wei integer string back to a decimal ETH string.
 *
 * Done with BigInt and string slicing rather than division: a double cannot
 * hold 18 significant digits, and a wallet handed an off-by-one-wei amount is
 * exactly the class of bug this library should not introduce.
 */
const weiToEth = (wei: string): string | undefined => {
  if (!/^\d+$/.test(wei)) return undefined;
  const padded = wei.padStart(19, '0');
  const whole = padded.slice(0, -18).replace(/^0+(?=\d)/, '');
  const fraction = padded.slice(-18).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

const cryptoParser = (type: 'bitcoin' | 'ethereum', scheme: string): PayloadParser => ({
  type,
  parse(text) {
    const match = new RegExp(`^${scheme}:([^?@]+)(?:@(\\d+))?`, 'i').exec(text.trim());
    if (!match) return null;
    const params = queryParams(text);
    const amount =
      type === 'ethereum' && params.value !== undefined ? weiToEth(params.value) : params.amount;
    return compact({
      address: match[1],
      chainId: match[2],
      amount,
      label: params.label,
      message: params.message,
    });
  },
});

const lightningParser: PayloadParser = {
  type: 'lightning',
  parse(text) {
    // Wallets accept a BOLT11 invoice bare as often as behind a `lightning:`
    // scheme, and the human-readable part always starts `ln` plus a network
    // prefix (bc mainnet, tb testnet, bcrt regtest).
    const match = /^(?:lightning:)?(ln(?:bc|tb|bcrt)[0-9a-z]+)$/i.exec(text.trim());
    return match ? compact({ invoice: match[1] }) : null;
  },
};

const upiParser: PayloadParser = {
  type: 'upi',
  parse(text) {
    if (!/^upi:\/\/pay/i.test(text.trim())) return null;
    const p = queryParams(text);
    // The field names are the URI parameters themselves, so no remapping.
    return compact({ pa: p.pa, pn: p.pn, am: p.am, cu: p.cu, tn: p.tn });
  },
};

const sepaParser: PayloadParser = {
  type: 'sepa',
  parse(text) {
    const lines = text.split(/\r\n|\n/);
    if (lines[0]?.trim() !== 'BCD') return null;
    // Positional format: service tag, version, charset, identification,
    // BIC, name, IBAN, amount, purpose, reference, remittance.
    return compact({
      bic: lines[4],
      name: lines[5],
      iban: lines[6],
      amount: lines[7]?.replace(/^EUR/i, ''),
      reference: lines[9],
      info: lines[10],
    });
  },
};

/** URL shapes that identify a more specific type than a bare link. */
const URL_PATTERNS: ReadonlyArray<{
  type: string;
  test: RegExp;
  extract?: (text: string) => PayloadValues | null;
}> = [
  { type: 'youtube', test: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i },
  { type: 'spotify', test: /^https?:\/\/(open\.)?spotify\.com\//i },
  {
    type: 'review',
    test: /^https?:\/\/search\.google\.com\/local\/writereview/i,
    extract: (text) => compact({ placeId: queryParams(text).placeid }),
  },
  {
    type: 'maps',
    test: /^https?:\/\/(www\.)?google\.[a-z.]+\/maps\//i,
    extract: (text) => compact({ q: queryParams(text).query }),
  },
  {
    type: 'googleform',
    test: /^https?:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/i,
    extract: (text) => compact({ url: text }),
  },
  {
    type: 'telegram',
    test: /^https?:\/\/t\.me\//i,
    extract: (text) => compact({ username: text.replace(/^https?:\/\/t\.me\//i, '') }),
  },
  {
    type: 'whatsapp',
    test: /^https?:\/\/wa\.me\//i,
    extract: (text) => {
      const phone = /^https?:\/\/wa\.me\/(\d+)/i.exec(text)?.[1];
      return compact({ phone, message: queryParams(text).text });
    },
  },
  { type: 'pdf', test: /^https?:\/\/\S+\.pdf(\?|$)/i },

  // App-store links, which is as far as the `app` type can honestly be
  // recovered. Its serialiser writes a single plain URL — a static QR cannot
  // branch on the scanning device — so a generic fallback link is
  // indistinguishable from an ordinary `url` payload and is left as one. A
  // store link is not, and carries which platform it is for.
  {
    type: 'app',
    test: /^https?:\/\/(apps|itunes)\.apple\.com\//i,
    extract: (text) => compact({ ios: text }),
  },
  {
    type: 'app',
    test: /^https?:\/\/play\.google\.com\/store\/apps\//i,
    extract: (text) => compact({ android: text }),
  },

  // Social profiles, derived from the same table the serialiser writes from,
  // so a network cannot be written in a form its own parser will not read.
  // These come last: `linkedin.com/in/x` must not be claimed by a broader
  // pattern above, and none of the patterns above are social hosts.
  ...SOCIAL_NETWORKS.map((network) => ({
    type: network.id,
    test: profileUrlPattern(network),
    extract: (text: string): PayloadValues | null => {
      const handle = profileUrlPattern(network).exec(text)?.[1];
      // Reserved paths that are not profiles. Without this, a link to
      // `github.com/about` parses as a profile named "about" and a clone of
      // it silently becomes someone else's page.
      if (!handle || RESERVED_PROFILE_PATHS.has(handle.toLowerCase())) return null;
      return compact({ handle });
    },
  })),
];

/**
 * Path segments that look like a handle but are the site's own pages.
 *
 * Kept deliberately short. The cost of missing one is a payload typed as a
 * profile instead of a URL, which `clone()` still round-trips correctly; the
 * cost of over-listing is refusing a real handle.
 */
const RESERVED_PROFILE_PATHS: ReadonlySet<string> = new Set([
  'about',
  'explore',
  'help',
  'home',
  'login',
  'privacy',
  'settings',
  'signup',
  'terms',
]);

const urlParser: PayloadParser = {
  type: 'url',
  confidence: 'heuristic',
  parse(text) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim())) return null;
    return compact({ url: text.trim() });
  },
};

/**
 * The built-in parsers, in priority order.
 *
 * Ordering is load-bearing: `mailto:` must be tried before the generic URL
 * parser, and vCard 4.0 before 3.0, or the more general reader claims the
 * payload first and the specific fields are lost.
 */
const BUILTIN: PayloadParser[] = [
  wifiParser,
  vcardParser('vcard4', '4.0'),
  vcardParser('vcard', '3.0'),
  mecardParser,
  eventParser,
  mailtoParser,
  smsParser,
  telParser,
  facetimeParser,
  geoParser,
  cryptoParser('bitcoin', 'bitcoin'),
  cryptoParser('ethereum', 'ethereum'),
  lightningParser,
  upiParser,
  sepaParser,
];

const custom: PayloadParser[] = [];

/**
 * Register an additional parser, tried before the built-ins.
 *
 * Useful for in-house formats — a warehouse's own `ASSET:` scheme, say — so a
 * scanned code decomposes into fields the same way the built-in types do.
 */
export const registerPayloadParser = (parser: PayloadParser): void => {
  custom.unshift(parser);
};

/**
 * Identify a payload and decompose it into fields.
 *
 * Always succeeds: anything unrecognised comes back as `type: 'text'` with the
 * whole string in `values.text`, so callers never have to handle a null.
 *
 * @example
 * const parsed = parsePayload('WIFI:T:WPA;S:Cafe;P:hunter2;;');
 * parsed.type;            // 'wifi'
 * parsed.values.ssid;     // 'Cafe'
 * parsed.values.password; // 'hunter2'
 */
export const parsePayload = (text: string): ParsedPayload => {
  const describe = (
    type: string,
    values: PayloadValues,
    confidence: 'exact' | 'heuristic',
  ): ParsedPayload => ({
    type,
    label: getPayloadType(type)?.label ?? type,
    values,
    raw: text,
    confidence,
  });

  for (const parser of [...custom, ...BUILTIN]) {
    const values = parser.parse(text);
    if (values) return describe(parser.type, values, parser.confidence ?? 'exact');
  }

  // URLs last: several specific types are URLs, and matching them first would
  // flatten a YouTube link or a review link into a generic one.
  const url = urlParser.parse(text);
  if (url) {
    for (const pattern of URL_PATTERNS) {
      if (!pattern.test.test(text.trim())) continue;
      if (!pattern.extract) return describe(pattern.type, url, 'heuristic');
      // A null extraction means the URL matched the shape but is not really
      // this type after all — `github.com/about` is not a profile. Keep
      // looking rather than claiming the type with generic URL fields, which
      // would make a clone of that link point somewhere else entirely.
      const extracted = pattern.extract(text.trim());
      if (extracted) return describe(pattern.type, extracted, 'heuristic');
    }
    return describe('url', url, 'heuristic');
  }

  return describe('text', { text }, 'exact');
};

/** Every payload type {@link parsePayload} can currently identify. */
export const parseablePayloadTypes = (): string[] => [
  ...new Set([
    ...custom.map((p) => p.type),
    ...BUILTIN.map((p) => p.type),
    ...URL_PATTERNS.map((p) => p.type),
    'url',
    'text',
  ]),
];
