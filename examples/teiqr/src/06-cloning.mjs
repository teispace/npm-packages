/**
 * Take an old code, change one field, restyle it.
 *
 * This is the feature the payload parsers exist for: scan a printed WiFi code,
 * change the password, and reprint it — without retyping an SSID or a vCard by
 * hand and hoping the escaping is right.
 */
import { clone, qr } from 'teiqr';
import { parsePayload, serializePayload } from 'teiqr/payload';
import { check, save, section } from './_shared.mjs';

section('An existing code, as if scanned off a wall');
const original = qr(
  serializePayload('wifi', {
    ssid: 'Pokhara Cafe',
    password: 'himalaya2026',
    encryption: 'WPA',
  }),
).png({ scale: 8 });

section('Read it back into fields');
const read = clone(original);
console.log(`    type       ${read.payload.type} (${read.payload.label})`);
console.log(`    confidence ${read.payload.confidence}`);
for (const [key, value] of Object.entries(read.payload.values)) {
  console.log(`    ${key.padEnd(10)} ${value}`);
}

section('Restyle it, payload untouched');
const restyled = clone(original, { moduleShape: 'extra-rounded', ecc: 'H' });
save('06-restyled.svg', restyled.svg());
// The payload is preserved byte for byte by default, so the clone scans to
// exactly the same string the original did.
check(restyled.verify().text === read.payload.raw, 'restyled clone should carry the identical payload');
console.log('    the clone scans to the identical payload');

section('Change one field, keep the rest');
const updated = clone(original, { moduleShape: 'rounded' }, { password: 'new-password-2027' });
save('06-updated.svg', updated.svg());
const check2 = parsePayload(updated.verify().text);
console.log(`    ssid     ${check2.values.ssid}   (unchanged)`);
console.log(`    password ${check2.values.password}   (updated)`);
check(check2.values.ssid === 'Pokhara Cafe', 'ssid should survive the edit');

section('Escaping is handled, which is the part people get wrong by hand');
const awkward = serializePayload('wifi', {
  ssid: 'My;Cafe\\Wifi',
  password: 'pa:ss;word',
  encryption: 'WPA',
});
console.log(`    serialised: ${awkward}`);
const back = parsePayload(awkward);
console.log(`    parsed ssid:     ${back.values.ssid}`);
console.log(`    parsed password: ${back.values.password}`);
check(back.values.ssid === 'My;Cafe\\Wifi', 'delimiters must survive a round trip');
