/**
 * Kanji, ECI, binary payloads and Structured Append.
 *
 * The parts of ISO/IEC 18004 most libraries skip, and the reasons you would
 * reach for each.
 */
import 'teiqr/kanji'; // side-effect import: registers the Shift-JIS table
import { encode, encodeStructured, ECI } from 'teiqr/core';
import { kanjiTableSize } from 'teiqr/kanji';
import { decodeMatrix, joinStructured } from 'teiqr/verify';
import { check, section } from './_shared.mjs';

section(`Kanji: 13 bits a character instead of 24 (${kanjiTableSize()} code points)`);
const japanese = '日本語のテキストをエンコードするテストです。漢字モードは大幅に小さくなります。';
const withKanji = encode(japanese, { kanji: true, ecc: 'M', boostEcc: false });
const withoutKanji = encode(japanese, { kanji: false, ecc: 'M', boostEcc: false });
console.log(`    with Kanji mode:    version ${withKanji.version} (${withKanji.size} modules)`);
console.log(`    as UTF-8 bytes:     version ${withoutKanji.version} (${withoutKanji.size} modules)`);
check(withKanji.version < withoutKanji.version, 'Kanji mode should need a smaller symbol');
check(decodeMatrix(withKanji).text === japanese, 'Kanji should round trip');

section('Mixed scripts segment automatically');
const mixed = encode('Order 12345 — 日本語テキスト', { kanji: true });
console.log(`    ${decodeMatrix(mixed).segments.map((s) => s.mode).join(' + ')}`);
// Characters with no Shift-JIS mapping fall back to byte mode without breaking
// the surrounding Kanji run.
const emoji = encode('日本語😀テキスト', { kanji: true });
console.log(`    with an emoji in it: ${decodeMatrix(emoji).segments.map((s) => s.mode).join(' + ')}`);
check(decodeMatrix(emoji).text === '日本語😀テキスト', 'emoji should survive');

section('ECI declares the character set explicitly');
// Most scanners sniff UTF-8 successfully, and some older ones reject a symbol
// carrying an ECI header, so teiqr never emits one unless asked.
const withEci = encode('café', { eci: ECI.UTF8 });
const decoded = decodeMatrix(withEci);
console.log(`    declared ECI ${decoded.eci} (UTF-8 is ${ECI.UTF8}), text "${decoded.text}"`);
check(decoded.eci === ECI.UTF8, 'the ECI header should survive');

section('Binary payloads, for data that is not text at all');
const binary = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0xde, 0xad, 0xbe, 0xef]);
const binaryResult = decodeMatrix(encode(binary));
console.log(`    in:  ${[...binary].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
console.log(`    out: ${[...binaryResult.bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
check(
  binaryResult.bytes.length === binary.length && binaryResult.bytes.every((b, i) => b === binary[i]),
  'raw bytes must survive exactly',
);

section('Structured Append: one payload across several symbols');
const long = 'This payload is deliberately longer than one symbol should carry. '.repeat(40);
const { symbols, count, parity } = encodeStructured(long, { ecc: 'M' });
console.log(`    split into ${count} symbols, parity 0x${parity.toString(16)}`);
// Scanned back in any order, and the parity catches a symbol from a different set.
const shuffled = [...symbols].reverse().map((s) => decodeMatrix(s));
const joined = joinStructured(shuffled);
console.log(`    rejoined ${joined.text.length} chars from symbols scanned in reverse`);
check(joined.text === long, 'Structured Append should reassemble exactly');

section('A single symbol still comes back as a set of one');
const small = encodeStructured('short', { ecc: 'M' });
console.log(`    count ${small.count} — no header is emitted when the payload fits`);
check(small.count === 1, 'a short payload should not be split');
