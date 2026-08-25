/**
 * Generating a lot of codes at once, and packaging them.
 *
 * The case this exists for: a spreadsheet someone else produced, and a ZIP to
 * hand to whoever is printing. The interesting part is the column matching —
 * a batch is only useful if it accepts the headings people actually type.
 */
import { encode } from 'teiqr/core';
import {
  createZip,
  exportQr,
  parseCsv,
  planBatch,
  toCsv,
  uniqueFilenames,
} from 'teiqr/export';
import { serializePayload } from 'teiqr/payload';
import { check, save, section } from './_shared.mjs';

const csv = [
  'Network name (SSID),Password,Security,Room',
  'Cafe Guest,himalaya2026,WPA,Lobby',
  'Cafe Staff,back;office,WPA,"Office, upstairs"',
  'Open Hotspot,,nopass,Terrace',
].join('\n');

section('Parse a CSV, quoting and embedded commas included');
const table = parseCsv(csv);
console.log(`    headers: ${table.headers.join(' | ')}`);
console.log(`    ${table.rows.length} rows, delimiter ${JSON.stringify(table.delimiter)}`);
check(table.rows[1][3] === 'Office, upstairs', 'a quoted comma must survive');

section('Match columns onto a payload type');
// Each field answers to several names: its key, its label, the label without
// the parenthetical, and the parenthetical alone. "SSID", "Network name" and
// "Network name (SSID)" all find the same field, because all three get typed.
const plan = planBatch('wifi', table);
console.log(`    matched: ${plan.matched.join(', ')}`);
console.log(`    ignored: ${plan.ignored.length ? plan.ignored.join(', ') : 'none'}`);
for (const row of plan.rows) {
  console.log(`    line ${row.line}: ${JSON.stringify(row.values)}`);
}

section('Rows missing a required field are reported, not guessed at');
const broken = planBatch('wifi', parseCsv('Password,Security\nsecret,WPA'));
for (const row of broken.rows) {
  console.log(`    line ${row.line} missing: ${row.missing.join(', ') || 'nothing'}`);
}
check(broken.rows[0].missing.includes('ssid'), 'a missing SSID should be reported');

section('Filenames are made unique and filesystem-safe');
console.log(`    ${uniqueFilenames(['menu', 'menu', 'a/b', 'menu']).join(', ')}`);

section('Render each row and zip the lot');
const files = plan.rows.map((row) => ({
  name: `${row.filename}.png`,
  data: exportQr(
    encode(serializePayload('wifi', row.values), { ecc: 'Q' }),
    { moduleShape: 'rounded' },
    'png',
    { scale: 8 },
  ).bytes,
}));
const zip = createZip(files);
save('10-batch.zip', zip);
console.log(`    ${files.length} PNGs, ${zip.length.toLocaleString()} bytes zipped`);

section('And a manifest back out as CSV');
// toCsv takes a header row and rows of cells, and quotes anything that needs it.
const manifest = toCsv(
  ['file', 'ssid'],
  plan.rows.map((row) => [`${row.filename}.png`, row.values.ssid ?? '']),
);
save('10-manifest.csv', manifest);
console.log(manifest.split('\n').map((l) => `    ${l}`).join('\n'));
