# JPEG fixtures

Baseline JPEGs of a QR code, **encoded by something other than this package**.

That is the whole point of them. A decoder checked only against its own
encoder's output is checked against its own assumptions; these carry Huffman
tables, quantisation tables, restart intervals and subsampling choices that
somebody else picked.

| File | Frame | What it covers |
| --- | --- | --- |
| `source.png` | — | the exact image the others were encoded from |
| `qr-444.jpg` | SOF0, 3 components, `1x1,1x1,1x1` | no chroma subsampling, near-lossless |
| `qr-420.jpg` | SOF0, 3 components, `2x2,1x1,1x1` | 4:2:0, the usual camera and web default |
| `qr-low.jpg` | SOF0, 3 components, `2x2,1x1,1x1` | 4:2:0 at low quality, heavy ringing |
| `qr-gray.jpg` | SOF0, 1 component, `1x1` | greyscale, and the non-interleaved scan path |

All four carry a `DRI` restart interval, so the restart-marker path is
exercised by every case rather than by a special one.

## Regenerating

`source.png` comes from the package itself:

```js
import { qr } from 'teiqr';
writeFileSync('source.png', qr('teiqr jpeg fixture').png({ scale: 6 }));
```

The JPEGs come from macOS `sips`, which is a genuinely independent encoder and
present on any Mac:

```bash
sips -s format jpeg -s formatOptions best   source.png --out qr-444.jpg
sips -s format jpeg -s formatOptions normal source.png --out qr-420.jpg
sips -s format jpeg -s formatOptions low    source.png --out qr-low.jpg
sips -m "/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc" \
     -s format jpeg source.png --out qr-gray.jpg
```

Greyscale needs the profile flag rather than `--setProperty colorSpace Gray`,
which silently does nothing to the output component count.

`sips` chooses the subsampling itself — 4:4:4 at `best` and 4:2:0 below it —
which is why the quality settings and the sampling factors are coupled in the
table above rather than varied independently.

If `source.png` is regenerated with different render options the JPEGs must be
regenerated too: `jpeg.test.ts` compares decoded pixels against it directly,
and that comparison is what would catch a mis-scaled inverse DCT.

## What is deliberately not here

**Progressive JPEG (SOF2).** The decoder refuses it by name, and the test
constructs that case by rewriting a byte of `qr-420.jpg` rather than shipping a
fixture for a format that is never decoded.

**4:2:2 (`2x1`).** `sips` will not emit it on request. The path is covered by
the same subsampling arithmetic as 4:2:0 and was verified by hand against real
4:2:2 files during development; a fixture would need a different encoder.
