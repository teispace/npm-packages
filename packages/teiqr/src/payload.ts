/**
 * `teiqr/payload` — typed builders for what a QR code can contain.
 *
 * A URL is the easy case. WiFi credentials, vCards, calendar events, SEPA
 * transfers and crypto payment URIs all have escaping rules that are easy to
 * get subtly wrong — an unescaped semicolon in a WiFi password silently
 * truncates it, and a vCard line over 75 octets must be folded without
 * splitting a multi-byte character.
 */

export {
  escapeMeCard,
  escapeVCard,
  escapeWifi,
  normalizePhone,
  normalizeUrl,
  unescapeMeCard,
  unescapeVCard,
  unescapeWifi,
  unfoldLines,
} from './payload/escape.js';
export {
  GROUP_LABEL,
  getPayloadType,
  isPayloadComplete,
  PAYLOAD_GROUPS,
  PAYLOAD_TYPES,
  type PayloadField,
  type PayloadGroup,
  type PayloadType,
  type PayloadValues,
  registerPayloadType,
  serializePayload,
  unregisterPayloadType,
} from './payload/index.js';
export {
  type ParsedPayload,
  type PayloadParser,
  parseablePayloadTypes,
  parsePayload,
  registerPayloadParser,
} from './payload/parse.js';
export { val } from './payload/types.js';
