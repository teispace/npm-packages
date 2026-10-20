/**
 * Every payload type, built and read back.
 *
 * The point of typed payloads is the escaping. A WiFi password containing a
 * semicolon, a vCard note longer than 75 octets, an address with a comma —
 * each has a rule, and getting one wrong produces a code that scans to
 * something subtly wrong rather than failing outright.
 */
import { GROUP_LABEL, PAYLOAD_GROUPS, PAYLOAD_TYPES, getPayloadType, serializePayload } from 'teiqr/payload';
import { parseablePayloadTypes, parsePayload, redactPayloadValues, validateOtpauth } from 'teiqr/payload';
import { encode } from 'teiqr/core';
import { check, section } from './_shared.mjs';

section(`${PAYLOAD_TYPES.length} built-in types, grouped`);
for (const { group, types } of PAYLOAD_GROUPS) {
  console.log(`    ${GROUP_LABEL[group].padEnd(12)} ${types.map((t) => t.id).join(', ')}`);
}

section('A few, serialised from their own sample values');
for (const id of ['wifi', 'vcard', 'event', 'geo', 'sms', 'bitcoin', 'upi']) {
  const type = getPayloadType(id);
  const text = serializePayload(id, type.sample);
  console.log(`    ${id.padEnd(9)} ${text.replace(/\n/g, '\\n').slice(0, 68)}`);
  // Every sample must actually fit a symbol; a builder that emits something
  // unencodable is worse than no builder.
  encode(text); // throws if a builder emitted something unencodable
}

section('Read back into fields');
const wifi = serializePayload('wifi', {
  ssid: 'Guest;Network',
  password: 'p@ss:word',
  encryption: 'WPA',
  hidden: 'true',
});
const parsed = parsePayload(wifi);
console.log(`    ${wifi}`);
console.log(`    -> type ${parsed.type}, confidence ${parsed.confidence}`);
console.log(`    -> ${JSON.stringify(parsed.values)}`);
check(parsed.values.ssid === 'Guest;Network', 'the delimiter must survive');

section('Which types can be read back, and which cannot');
const parseable = new Set(parseablePayloadTypes());
const missing = PAYLOAD_TYPES.filter((t) => !parseable.has(t.id)).map((t) => t.id);
console.log(`    ${parseable.size} parseable`);
console.log(`    not recoverable from their own output: ${missing.length ? missing.join(', ') : 'none'}`);
// `app` is the interesting case: a static QR cannot branch on the scanning
// device, so it serialises to a single plain URL. A store link is recognised;
// a generic fallback link is genuinely indistinguishable from a `url`.
console.log(`    app store link  -> ${parsePayload('https://apps.apple.com/app/id123').type}`);
console.log(`    app fallback    -> ${parsePayload('https://example.com/app').type}`);

section('Social profiles read the hosts people actually paste');
for (const url of [
  'https://twitter.com/someone',
  'https://m.facebook.com/somepage',
  'https://www.linkedin.com/in/some-person/',
  'https://github.com/someone?tab=repositories',
  'https://github.com/someone/some-repo',
]) {
  const p = parsePayload(url);
  console.log(`    ${url.padEnd(45)} -> ${p.type}${p.values.handle ? ` (${p.values.handle})` : ''}`);
}

section('Authenticator enrolment (otpauth), and keeping the secret out of logs');
{
  const values = {
    issuer: 'Example',
    account: 'you@example.com',
    // Grouped and lower-case, the way a service shows it; normalised on output.
    secret: 'jbsw y3dp ehpk 3pxp jbsw y3dp ehpk 3pxp',
    digits: '8',
  };
  console.log(`    problems: ${JSON.stringify(validateOtpauth(values))}`);
  const uri = serializePayload('otpauth', values);
  const read = parsePayload(uri);
  check(read.type === 'otpauth', 'a key URI must read back as otpauth');
  check(serializePayload(read.type, read.values) === uri, 'and round trip exactly');
  // Log the redacted copy, never the values themselves.
  console.log(`    -> ${JSON.stringify(redactPayloadValues(read.type, read.values))}`);
  check(!JSON.stringify(redactPayloadValues(read.type, read.values)).includes('JBSW'), 'the secret must be masked');

  const short = validateOtpauth({ ...values, secret: 'JBSWY3DPEHPK3PXP' });
  console.log(`    a 10-byte secret: ${short.map((p) => `${p.level}: ${p.message}`).join('; ')}`);
  const export_ = parsePayload('otpauth-migration://offline?data=AAAA');
  console.log(`    otpauth-migration:// -> ${export_.type} (${export_.unsupported})`);
}
