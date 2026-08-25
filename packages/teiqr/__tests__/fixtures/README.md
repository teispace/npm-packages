# Conformance fixtures

`micro-qr.json` and `rmqr.json` are module matrices produced by **independent
implementations** of ISO/IEC 18004 and ISO/IEC 23941. They are the answer to a
problem that round trips cannot solve: for a table-driven format, a single
transposed value produces a symbol that encodes and decodes perfectly through
our own code and is rejected by every real scanner. Both halves share the same
wrong table, so both halves agree.

Two suites consume them. `micro.test.ts` and `rmqr.test.ts` check that our
**encoder** reproduces each matrix module for module; `decode-variants.test.ts`
checks that our **decoder** reads each one back to its exact payload. The
second is the stronger of the two, because those symbols were built by code we
did not write.

## Provenance

| File | Oracle | Cases |
| --- | --- | ---: |
| `micro-qr.json` | segno 1.6.6 | 612 |
| `rmqr.json` | rmqrcode (MIT) | 507 |

Each file carries `_source`, `_segments` and `_excluded` fields recording the
same details inline.

## How they were produced

The generators are Python, because both oracles are Python libraries, so they
are deliberately **not** kept in this repository — this is a JavaScript
monorepo and nothing here should need a Python toolchain to build, test or
release. The fixture data is committed; the recipe below is enough to rebuild
it. Run `yarn lint --write` afterwards, since these files are formatted like
any other source in the repo.

### Micro QR

Install `segno`, then for each plan sweep every version (M1-M4), every level
that version permits, and all four masks, with `boost_error=False` so the level
in the output is exactly the level requested. Emit
`{segments, text, version, ecc, mask, rows}`, where `rows` renders each module
as `#` or `.`.

Plans are: each single-mode payload from

    1  12  123  12345  123456  1234567  12345678  1234567890
    A  AB  HELLO  HELLO WORLD  AC-42  hello  Hi there!  abc123XYZ

assigned the narrowest mode that fits it, plus these mixed and Kanji splits:

    byte[abc] + alphanumeric[123XYZ]
    alphanumeric[HELLO] + numeric[123]
    numeric[12] + alphanumeric[AB]
    alphanumeric[A] + numeric[1] + alphanumeric[B]
    byte[x] + numeric[42]
    kanji[漢]
    kanji[漢字]
    kanji[こんにちは]
    kanji[漢字] + numeric[123]
    alphanumeric[AB] + kanji[漢字]

segno takes a list of `(content, mode)` tuples for a multi-segment symbol and a
bare value for a single one; Kanji needs `encoding='shift-jis'`.

### rMQR

Install `rmqrcode`, then for each plan sweep all 32 sizes at both levels,
building with `rMQR(version, level, with_quiet_zone=False)` and
`add_segments([{'data': …, 'encoder_class': …}])`. Strip the two-module border
from `to_list()`.

Plans are the single-mode payloads

    A  12345  HELLO  HELLO WORLD 123  hello world  SERIAL-4417

plus:

    alphanumeric[SERIAL-] + numeric[4417]
    byte[abc] + alphanumeric[123XYZ]
    alphanumeric[HELLO] + numeric[12345]
    alphanumeric[A] + numeric[1] + alphanumeric[B]
    kanji[漢字]
    kanji[こんにちは世界]
    kanji[漢字] + numeric[123]
    alphanumeric[AB] + kanji[漢字]

## Why every case pins its segmentation

Two encoders can both be correct and still split a string differently across
modes — ours segments optimally, the references encode whatever they are given
or use one mode throughout. Comparing module matrices only means something when
both sides write the same runs, so each case carries its segmentation and both
encoders are handed it explicitly.

Mode *selection* is therefore checked separately, and differently: tests assert
our chosen segmentation is never larger than any single-mode encoding of the
same text. That is a property, not a comparison, and it does not depend on
another implementation's choices.

## What is excluded, and why

Every exclusion is a place the reference is wrong, not us.

**segno — spurious padding byte.** `write_padding_bits` uses
`8 - (length % 8)`, which is 8 rather than 0 when the bit stream already ends on
a codeword boundary. ISO/IEC 18004 §7.4.10 — quoted in segno's own docstring for
that function — adds padding bits only when the stream does *not* end at a
boundary. The bug also affects its full-QR output. Affected combinations are
detected using segno's own `Buffer`, `write_segment` and `write_terminator`
rather than a hardcoded list, and only when pad codewords still follow: when the
terminator lands exactly on capacity the extra byte overruns and is discarded
again. Our encoder covers that path by round trip instead — see
`micro.test.ts`, "round trips a stream that ends exactly on a codeword
boundary".

**rmqrcode — mixed block sizes.** Its interleaver uses `break` where the
standard skips an exhausted block and continues, so it silently drops data
codewords: one of 73 for R13x99-M, four of 76 for R17x139-H. Those symbols
cannot decode. Sizes whose Reed-Solomon blocks differ in length are skipped, and
a test asserts our own interleaving is lossless at every size, since that is the
exact bug class.

**rmqrcode — R17x43-M.** Its table lists a 60-codeword block against that
size's own total of 61. The H blocks sum to 61, the module count gives
61 × 8 + 1 = 489, and 60 − 39 = 21 error correction codewords has no generator
polynomial in its own table, which is why it raises `KeyError: 21` there. We
use 61, giving 22.

**rmqrcode — R13x27-M.** Its table lists 14 data codewords against its own
stated 96 data bits, which is 12. See the note above `RMQR_SPECS` in
`src/core/rmqr-tables.ts` for the four signals that settle it. We use 12,
giving 9 error correction codewords.

The layout is shared across all 32 rMQR sizes, so the sizes that remain still
exercise every width, height and alignment-column arrangement.
