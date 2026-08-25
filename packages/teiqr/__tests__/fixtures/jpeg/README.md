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
| `qr-422.jpg` | SOF0, 3 components, `2x1,1x1,1x1` | 4:2:2 — chroma halved on one axis only |
| `qr-progressive.jpg` | SOF2, 3 components, `2x2,1x1,1x1` | progressive, ten scans |
| `qr-progressive-gray.jpg` | SOF2, 1 component, `1x1` | progressive greyscale, six scans |

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

`sips` will not emit 4:2:2 or progressive on request, so those come from
libjpeg (`brew install jpeg-turbo`):

```bash
djpeg -pnm qr-444.jpg | cjpeg -quality 90 -sample 2x1 -optimize > qr-422.jpg
jpegtran -progressive -copy none qr-420.jpg  > qr-progressive.jpg
jpegtran -progressive -copy none qr-gray.jpg > qr-progressive-gray.jpg
```

**`jpegtran -progressive` is lossless**, and that is the whole point of using
it here. It rearranges the same quantised coefficients into spectral bands and
bit planes without going near a pixel, so the progressive files must decode to
output *byte-identical* to their baseline sources. `jpeg.test.ts` asserts
exactly that. Re-encoding them instead would only allow a tolerance, and a
tolerance cannot tell a correct refinement pass from a nearly-correct one.

`sips` chooses the subsampling itself — 4:4:4 at `best` and 4:2:0 below it —
which is why the quality settings and the sampling factors are coupled in the
table above rather than varied independently.

If `source.png` is regenerated with different render options the JPEGs must be
regenerated too: `jpeg.test.ts` compares decoded pixels against it directly,
and that comparison is what would catch a mis-scaled inverse DCT.

## What is deliberately not here

**Arithmetic-coded, lossless, differential and hierarchical JPEG.** All are
refused by name, and the tests construct those cases by rewriting a frame
marker rather than shipping fixtures for formats that are never decoded.

**A photograph.** Every fixture here is a rendered code that has been through a
real encoder, which exercises the *format* thoroughly and says nothing about
lens blur, moiré or non-flat paper. That gap belongs to
`__tests__/fixtures/photos/` and only a camera can close it.
