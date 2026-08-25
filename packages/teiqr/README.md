# teiqr

**The complete QR toolkit — generate, style, validate, and scan.** Zero dependencies, one
synchronous API, identical output in Node, browsers, Cloudflare Workers, Deno and Bun.

```bash
npm install teiqr
```

> **Status: 0.0.x — early, but not experimental.** Everything documented here is implemented,
> tested, and now covered by a [stability policy](#stability). The version stays low while the
> API settles under real use; a patch release may still make a breaking change, but only
> deliberately and only with the reason in the changelog. What is here is verified to the
> standard described under [Conformance and testing](#conformance-and-testing), not to a
> "we'll fix it later" standard.

```ts
import { qr, scan } from 'teiqr';

qr('https://example.com').svg();                  // → '<svg …>'
qr('https://example.com').png({ scale: 12 });     // → Uint8Array (no canvas)
scan(pngBytes).text;                              // → 'https://example.com'
```

---

## What it does

One MIT-licensed package covering the whole job, with no runtime dependencies:

- **Encode** QR (versions 1-40), Micro QR (M1-M4) and rMQR (32 rectangular sizes), all three
  with optimal multi-mode segmentation, Kanji and binary payloads. Full QR additionally does
  ECI and Structured Append, which the compact symbologies do not define.
- **Style** with 10 module shapes, 6 eye frames, 5 eye balls, gradients, logos and frames.
- **Validate** whether a code will actually scan — contrast, quiet zone, shape risk, print
  size, and exactly how much of the error correction budget a logo consumes.
- **Decode** from a matrix or an image, with full Reed-Solomon recovery. PNG is read
  natively in every shape the format allows; JPEG too, baseline and progressive, opt-in.
- **Export** to SVG, PNG, PDF, EPS and ZIP, all synchronously and without a canvas.
- **Build payloads** for 32 typed formats — and parse them back into fields.

It runs identically in Node, browsers, Cloudflare Workers, Deno and Bun, ships React
components and a CLI, and every registry it exposes is open to extension.

### Three things worth knowing

**It tells you the truth about logos.** The usual advice — "keep a logo under 30% at level H"
— is wrong in both directions. Error correction is applied per Reed-Solomon block, not across
the symbol, so damage concentrated in one block can kill a code covering far less than 30%,
while evenly spread damage survives much more. `teiqr` walks the real module placement order
and the real interleave map and gives you the exact number.

**It can prove a code scans.** Because the decoder ships alongside the encoder, a styled,
logo-bearing symbol can be rasterised and read back in-process. `verify()` is not an estimate.

**Its mask selection is spec-conformant.** ISO/IEC 18004 Table 11 feature 4 scores the
deviation of dark modules from 50% in complete 5% steps, symmetrically. All 477,360
`(dark, total)` pairs across all 40 versions are brute-forced against the spec text by a
regression test, and none diverge.

---

## Contents

- [Quick start](#quick-start) · [Encoding](#encoding) · [Styling](#styling) · [Output formats](#output-formats)
- [Scanning](#scanning) · [Cloning an existing code](#cloning-an-existing-code) · [Validation](#validation)
- [PDF/EPS](#pdf-and-eps--print-ready-vector-at-a-real-physical-size) · [ZIP & batch](#zip-and-csv-driven-batch)
- [Payloads](#payloads) · [Extensibility](#extensibility)
- [Kanji, ECI, binary](#kanji-eci-and-binary) · [Structured Append](#structured-append) · [Terminal](#terminal-output)
- [Command line](#command-line) · [React](#react) · [Entry points & bundle size](#entry-points-and-bundle-size)
- [Runtime support](#runtime-support) · [Stability](#stability)
- [API reference](#api-reference) · [Conformance & testing](#conformance-and-testing)

---

## Quick start

`qr()` builds a symbol once and gives you every output format from it.

```ts
import { qr } from 'teiqr';

const code = qr('https://example.com', {
  ecc: 'Q',                 // encoding option
  moduleShape: 'rounded',   // styling option — one options bag for both
});

code.svg();                       // string
code.png({ scale: 12 });          // Uint8Array
code.dataUrl();                   // 'data:image/png;base64,…'
code.pixels({ scale: 8 });        // { pixels, width, height, omitted }
code.terminal();                  // string, for console.log
code.validate();                  // { score, issues, coverage, print, … }
code.verify();                    // rasterise + read back; throws if unreadable
code.matrix;                      // the raw QrMatrix
```

Writing a file in Node:

```ts
import { writeFile } from 'node:fs/promises';
await writeFile('qr.png', qr('https://example.com').png({ scale: 10 }));
```

---

## Encoding

```ts
import { encode } from 'teiqr/core';

encode('https://example.com', {
  ecc: 'M',          // 'L' | 'M' | 'Q' | 'H'   (default 'M')
  boostEcc: true,    // raise the level for free when the version has slack (default true)
  minVersion: 1,
  maxVersion: 40,
  mask: undefined,   // pin 0-7, or let the penalty score choose
  eci: undefined,    // e.g. ECI.UTF8
  kanji: false,      // needs `import 'teiqr/kanji'`
});
```

**Optimal segmentation is automatic.** Mode switching costs a mode indicator plus a count
field, so the cheapest encoding of a string is rarely one mode throughout. `teiqr` runs a
Viterbi pass over numeric, alphanumeric, byte and Kanji modes in exact sixth-of-a-bit
arithmetic, so `https://example.com/order/1234567890` encodes as byte + numeric rather than
all-byte. This routinely saves a whole version.

The same pass drives Micro QR and rMQR, priced against their own narrower headers and
against the modes each version actually offers — so it is one verified optimiser, not three
approximations of one.

**`boostEcc` is free redundancy.** The chosen version usually has slack left over; spending it
on stronger error correction costs no extra modules:

```ts
encode('A', { ecc: 'M' }).ecc;                    // 'H' — same size, more damage tolerance
encode('A', { ecc: 'M', boostEcc: false }).ecc;   // 'M'
```

### Input types

```ts
encode('text');                                   // string, optimally segmented
encode(new Uint8Array([0xde, 0xad, 0xbe, 0xef])); // arbitrary binary
encode([makeAlphanumericSegment('ABC'), makeNumericSegment('123')]); // hand-built segments
```

---

## Styling

Every option is optional; the defaults are a plain black-on-white, spec-compliant code.

```ts
qr('https://example.com', {
  moduleShape: 'rounded',   // square | dot | rounded | extra-rounded | classy
                            // diamond | star | vertical | horizontal | fluid
  eyeFrame: 'rounded',      // square | rounded | circle | leaf | cut | dotted
  eyeBall: 'rounded',       // square | dot | rounded | leaf | diamond

  body: { kind: 'linear', angle: 45, stops: [
    { offset: 0, color: '#0b1020' },
    { offset: 1, color: '#123a6b' },
  ]},
  eyeFrameFill: { kind: 'solid', color: '#000000' },   // defaults to `body`
  background: { kind: 'solid', color: '#ffffff' },     // null → transparent

  quietZone: 4,     // modules of clear space; 4 is the spec minimum
  cornerRadius: 0,
  moduleSize: 8,    // px per module for SVG width/height
  gap: 0,           // 0 flush, 0.1 a hairline gap between modules

  logo: {
    href: 'data:image/png;base64,…',  // data URI only — exports must be self-contained
    sizeRatio: 0.22,
    padding: 1,
    shape: 'rounded',                 // square | rounded | circle
    excavate: true,                   // clear modules behind it rather than covering them
    background: '#ffffff',
  },

  frame: {
    style: 'label-bottom',  // none | box | label-bottom | label-top
    text: 'SCAN ME',
    textColor: '#ffffff',
    background: '#000000',
    border: 1,
    cornerRadius: 2,
    fontFamily: 'Helvetica, Arial, sans-serif',
  },
});
```

### Shapes cost detection margin — and we measured how much

Many scanners verify a finder pattern by checking its 1:1:3:1:1 ratio horizontally,
vertically **and diagonally**. A circular eye core measures 3.0 across its diagonal where a
square measures 4.24, so the diagonal check fails. Modern phone cameras use ML detection and
tolerate it; older and cheaper hardware does not.

Rather than guess, every variant was rendered and decoded with an independent decoder across
3 payloads × 4 error correction levels × 6 module scales — **72 decode attempts each**:

| Module shape    | Pass rate | Tier      |     | Eye frame | Pass rate | Tier      |     | Eye ball  | Pass rate | Tier      |
| --------------- | --------- | --------- | --- | --------- | --------- | --------- | --- | --------- | --------- | --------- |
| `square`        | 72/72     | ✅ safe   |     | `square`  | 72/72     | ✅ safe   |     | `square`  | 72/72     | ✅ safe   |
| `rounded`       | 72/72     | ✅ safe   |     | `rounded` | 72/72     | ✅ safe   |     | `rounded` | 67/72     | ⚠️ reduced |
| `extra-rounded` | 72/72     | ✅ safe   |     | `cut`     | 72/72     | ✅ safe   |     | `dot`     | 37/72     | ❌ poor   |
| `vertical`      | 72/72     | ✅ safe   |     | `dotted`  | 68/72     | ⚠️ reduced |     | `leaf`    | 35/72     | ❌ poor   |
| `horizontal`    | 72/72     | ✅ safe   |     | `leaf`    | 49/72     | ❌ poor   |     | `diamond` | 9/72      | ❌ poor   |
| `fluid`         | 72/72     | ✅ safe   |     | `circle`  | 42/72     | ❌ poor   |     |           |           |           |
| `dot`           | 61/72     | ❌ poor   |     |           |           |           |     |           |           |           |
| `classy`        | 54/72     | ❌ poor   |     |           |           |           |     |           |           |           |
| `diamond`       | 36/72     | ❌ poor   |     |           |           |           |     |           |           |           |
| `star`          | 36/72     | ❌ poor   |     |           |           |           |     |           |           |           |

> **Scale matters as much as shape.** Detached shapes (`dot`, `diamond`, `star`) fail *more* at
> large sizes, not less: at small scales anti-aliasing bleeds neighbouring modules together and
> they read fine, while at 8 px and up the gaps become real and the decoder loses the grid.
> That is the opposite of the usual intuition — which is exactly why previewing at one size
> proves nothing, and why `verify()` exists.

Pass rates are available at runtime via `SAFETY_EVIDENCE`, and `validate()` turns them into
warnings automatically.

---

## Output formats

### SVG

Pure string building — no DOM, no canvas. Safe to call on a server or in a Worker.

```ts
import { renderSvg } from 'teiqr/render';
const { svg, widthPx, heightPx } = renderSvg(matrix, { moduleShape: 'rounded' });
```

Gradient ids are derived from a hash of the fill, so they are stable across renders: server
and client markup agree, and re-rendering does not churn the DOM.

### PNG — with no canvas anywhere

```ts
import { toPng } from 'teiqr/raster';
const bytes = toPng(matrix, { moduleShape: 'rounded' }, { scale: 12, background: '#ffffff' });
```

This package contains a complete DEFLATE compressor, a PNG encoder/decoder, and an
anti-aliased scanline rasteriser. That is why PNG output is **synchronous, dependency-free,
and byte-identical in every runtime** — no `node-canvas`, no native build step, no
`CompressionStream`, and it works on Cloudflare Workers.

The DEFLATE implementation is verified against Node's own `zlib` inflater across empty input,
single bytes, window-edge matches at exactly 32,768 bytes, and random data at all ten
compression levels. The rasteriser is verified pixel-exact: for a square-module code, all five
sample points of every module match the matrix, and the quiet zone is provably untouched.

```ts
toPng(matrix, style, {
  scale: 12,               // device pixels per module
  width: 512,              // exact output width; takes precedence over scale
  background: '#ffffff',   // null keeps transparency
  level: 6,                // DEFLATE effort, 0-9
  dpi: 300,                // writes a pHYs chunk so print tools size it correctly
});
```

> **Two caveats, reported rather than hidden.** Raster output cannot draw frame *label text*
> (that needs a font engine) and can only embed **PNG** data-URI logos. Both are listed in
> `rasterize().omitted` so you can detect them; SVG and the vector formats handle both fully.

### Raw pixels

```ts
import { rasterize } from 'teiqr/raster';
const { pixels, width, height, omitted } = rasterize(matrix, style, { scale: 8 });
// `pixels` is RGBA, exactly like canvas ImageData — composite it however you like.
```

### PDF and EPS — print-ready vector at a real physical size

```ts
import { exportQr } from 'teiqr/export';

const { bytes, mime, extension, omitted } =
  exportQr(matrix, { moduleShape: 'rounded' }, 'pdf', { sideMm: 40, title: 'Table 12' });

await writeFile(`menu.${extension}`, bytes);
```

`sideMm` is the actual printed size, not a pixel count — a 40 mm PDF opens as 40 mm in
Illustrator, InDesign or a print shop's RIP. Every format serialises from the same scene, so
the geometry cannot drift between your SVG preview and the PDF that goes to press.

Both are **synchronous and canvas-free**, including logo embedding: raster logos are decoded
with this package's own PNG decoder rather than drawn to a canvas, which is why PDF export
produces the same document on a server as in a browser. PDF carries logo transparency through
a soft mask; EPS has no soft mask worth relying on across RIPs, so it flattens onto the
background colour beneath the logo.

Returns bytes rather than a `Blob`, so the same call works in Node and streams straight into a
Worker `Response`.

### ZIP and CSV-driven batch

```ts
import { createZip, exportQr, parseCsv, planBatch, uniqueFilenames } from 'teiqr/export';
import { serializePayload } from 'teiqr/payload';

const plan = planBatch('wifi', parseCsv(csvText));
const names = uniqueFilenames(plan.rows.map((r) => r.filename));

const zip = createZip(
  plan.rows.map((row, i) => ({
    name: `${names[i]}.png`,
    data: exportQr(qr(serializePayload('wifi', row.values)).matrix, {}, 'png', { scale: 10 }).bytes,
    store: true,   // PNG is already compressed
  })),
);
```

`planBatch` matches CSV columns to payload fields by several aliases — a column headed
`Network Name`, `SSID` or `Network name (SSID)` all find the same field, because all three are
what people actually type. Rows missing a required field come back with a populated `missing`
array rather than being dropped.

`serializePayload` refuses a payload whose required fields are absent, rather than emitting
one that scans and says nothing — `serializePayload('url', {})` used to return the empty
string. The field metadata always recorded which fields are required; now the serialiser
checks it, the way `planBatch` always has.

> **It will not invent data for you.** A column your sheet omits stays absent, and the row is
> reported as incomplete. The alternative — filling from the payload type's sample — would
> quietly emit five hundred codes all pointing at the sample network. Pass
> `{ fillFromSample: true }` if you want that behaviour for an interactive editor.

The ZIP writer is synchronous and produces byte-identical archives across builds (entries are
stamped with a fixed timestamp), so output is diffable and cacheable.

---

## Scanning

One function, almost any input.

```ts
import { scan, scanAll, tryScan, scanAsync } from 'teiqr/verify';

scan(await readFile('ticket.png')).text;      // Node Buffer
scan(arrayBuffer).text;                       // ArrayBuffer / Uint8Array
scan('data:image/png;base64,iVBORw0…').text;  // data URL or bare base64
scan(ctx.getImageData(0, 0, w, h)).text;      // canvas ImageData
scan({ data, width, height }).text;           // any raw pixel buffer
scan(canvasElement).text;                     // <canvas>, <img>, <video>, ImageBitmap
scan(matrix).text;                            // a QrMatrix, no pixels involved
```

Raw pixel buffers may be RGBA, RGB or 8-bit grayscale — pass `channels: 3` or `channels: 1`.

The bundled PNG decoder reads **the whole format**, not just what this package writes:
greyscale, truecolour, palette and both alpha variants, at every bit depth each allows,
interlaced or not, honouring `tRNS` transparency. That breadth earns its place — a QR code
is a two-colour image, so it is exactly what encoders and optimisers store as 1-bit palette
or greyscale. A decoder that handled only 8-bit RGBA would reject most QR PNGs in existence.

A camera, though, produces JPEG. One side-effect import decodes that natively too —
synchronously, on every runtime, with no canvas:

```ts
import { scan } from 'teiqr/verify';
import 'teiqr/jpeg';                          // JPEG, +3.4 kB

scan(await readFile('photo.jpg')).text;
```

It is a separate entry for the same reason the Shift-JIS table is: a code you generated
is never a JPEG, so the Huffman tables and inverse DCT stay out of the default bundle.

The **CLI needs no such import** — it registers the decoder itself, because "add
`import 'teiqr/jpeg'`" is not advice anyone can act on at a shell prompt.

All three Huffman structures are read — baseline, extended sequential and **progressive** —
in greyscale or colour, at every chroma subsampling, with restart intervals and `tRNS`-style
Adobe colour transforms. Progressive matters more than its share of cameras suggests: it is
what much of the web serves, and a scanner is usually pointed at an image that came from
somewhere else.

### What can be read, and from where

| Symbology | Encode | Decode from a matrix | Locate in an image | Off-axis capture |
| --- | :---: | :---: | :---: | :---: |
| QR (versions 1-40) | ✅ | ✅ | ✅ | ✅ perspective |
| Micro QR (M1-M4) | ✅ | ✅ | ✅ | rotation only |
| rMQR (32 sizes) | ✅ | ✅ | ✅ | rotation only |

`decodeMatrix()` and `scan()` read all three, from a `QrMatrix` or from pixels.

QR is located through a fitted **perspective transform**, so a symbol photographed at an angle
samples correctly across its whole width instead of drifting off the modules partway. Three
finder centres plus the bottom-right alignment pattern give the four correspondences a
homography needs, and candidate fits are scored against the timing patterns — known in advance
for every symbol — so a misdetected alignment pattern is rejected rather than believed.

The compact symbologies have fewer landmarks: Micro QR has one finder, rMQR has a finder plus a
5x5 sub-finder, and a lone 7x7 finder is rotationally symmetric — it fixes position and scale
and says nothing about which way up the symbol is. Their orientation is recovered from the
fourth angular harmonic of the finder's own outline, which pins it to within a hundredth of a
degree but only modulo a quarter turn; the four candidates are then tried against every size
the symbology defines and validated by format information and Reed-Solomon. So they are located
under a **similarity transform** — rotation and scale, not perspective.

```ts
import { decodeMatrix } from 'teiqr/verify';
import { encodeMicro, encodeRmqr } from 'teiqr/core';

decodeMatrix(encodeMicro('12345')).text;   // '12345'
decodeMatrix(encodeRmqr('HELLO')).text;    // 'HELLO'
```

`decodeMicroMatrix` and `decodeRmqrMatrix` are also exported directly when you want the
symbology-specific result, which carries the version label (`'M3'`, `'R13x99'`) and the
segments the symbol was built from.

```ts
tryScan(frame);            // → ScanResult | null, for camera loops where most frames are empty
scanAll(sheetOfTickets);   // → ScanResult[], every code in one image, in reading order
await scanAsync(jpegBytes);// adds JPEG/WebP/AVIF wherever createImageBitmap exists
```

### What you get back

```ts
const result = scan(bytes);
result.text;        // decoded payload
result.bytes;       // raw bytes, for binary payloads
result.version;     // 1-40
result.ecc;         // 'L' | 'M' | 'Q' | 'H'  — read from the symbol's own format info
result.mask;        // 0-7
result.segments;    // [{ mode: 'byte', text: '…' }, …]
result.corrected;   // codewords Reed-Solomon had to repair; 0 means pristine
result.moduleSize;  // measured module pitch in pixels
result.origin;      // where the symbol sits in the image
result.eci;         // when the symbol declared a charset
result.structured;  // { index, total, parity } for Structured Append members
```

`corrected` is genuinely useful: a code that needs repairs is still readable but is degrading,
which is a good signal to reprint before it stops working.

### It repairs real damage

Reed-Solomon correction is full Berlekamp-Massey + Chien + Forney, not a checksum. Tested:
damage right up to the per-block budget is recovered exactly, one codeword beyond it raises
`UncorrectableError` — the decoder never guesses and never returns wrong text.

The same tests pin the property the logo analysis rests on: the *same number* of damaged
codewords survives when spread across blocks and is fatal when concentrated in one.

Light-on-dark codes are retried inverted automatically (`tryInverted`, on by default).

---

## Cloning an existing code

Scan an old code, get its fields, change what you want, re-render it in a new style. No
retyping a WiFi password off a laminated card.

```ts
import { clone } from 'teiqr';

const cloned = clone(await readFile('old-code.png'), { moduleShape: 'rounded' });

cloned.payload.type;             // 'wifi'
cloned.payload.values.ssid;      // 'Pokhara Cafe'
cloned.payload.values.password;  // 'himalaya2026'
cloned.payload.confidence;       // 'exact' — the WIFI: scheme is unambiguous

await writeFile('new-code.png', cloned.png({ scale: 12 }));
```

The payload is preserved byte for byte by default, so the clone scans to exactly the same
string — even for a proprietary format no parser recognises. Pass edited fields to rebuild:

```ts
const old = clone(bytes);
const updated = clone(bytes, { moduleShape: 'dot' }, {
  ...old.payload.values,
  password: 'a-new-password',
});
```

`parsePayload()` is available on its own if you only want the fields:

```ts
import { parsePayload } from 'teiqr/payload';

parsePayload('WIFI:T:WPA;S:My\;Cafe;P:hunter2;;');
// { type: 'wifi', label: 'WiFi network', confidence: 'exact',
//   values: { encryption: 'WPA', ssid: 'My;Cafe', password: 'hunter2' }, raw: '…' }
```

Every built-in type round-trips: `serialize(parse(serialize(v))) === serialize(v)` is enforced
by test for all of them, including folded vCard lines and escaped WiFi delimiters.
`confidence` is `'exact'` for unambiguous schemes and `'heuristic'` when the type was inferred
from a URL's shape.

Social profiles are read back from the hosts people actually paste, not only the canonical one
the serialiser writes — `twitter.com` for X, `m.facebook.com` from a phone, a trailing slash or
a `?tab=` query. A site's own pages are not mistaken for profiles: `github.com/about` stays a
`url`, and so does anything deeper than a handle, because typing `github.com/someone/a-repo` as
a profile would make a clone of it point at the user instead of the repository.

One type cannot be fully recovered, and the reason is inherent. `app` exists to send iOS to the
App Store and Android to Play, but a static QR code cannot branch on the scanning device — only
a server can — so it serialises to a single plain URL. A store link is recognised and carries
which platform it is for; a generic fallback link is indistinguishable from an ordinary `url`
and is reported as one. `clone()` reproduces the payload byte for byte either way.

---

## Validation

```ts
import { validate } from 'teiqr/validate';

const report = validate(matrix, style, { scanDistanceMm: 300, dpi: 300 });

report.score;      // 0-100, at-a-glance only
report.issues;     // [{ level, code, title, detail }]
report.contrast;   // worst-case ratio, gradients judged by their worst stop
report.inverted;   // light-on-dark
report.coverage;   // exact logo damage, or null
report.print;      // recommended physical size
```

### The logo analysis

```ts
report.coverage;
// {
//   coveredModules: 121,
//   coveredFraction: 0.11,      // for display only — NOT what determines survival
//   damagedCodewords: 19,
//   worstBlockDamaged: 7,       // the number that actually matters
//   worstBlockCapacity: 11,     // this block's Reed-Solomon budget
//   utilisation: 0.64,          // 1.0 is exactly at the limit
//   recoverable: true,
//   breaksFinder: false,        // fatal at any ECC level — decoders need finders to locate the code
// }
```

`breaksFinder` is called out separately because no error correction level survives it: the
decoder needs the finder patterns to locate the symbol *before* error correction runs.

### Print sizing

The industry rule is that a code reads at roughly ten times its own width. That alone is not
enough — it has to be checked against a floor on module pitch, because below about 0.4 mm ink
spread closes the gaps between modules whatever the overall size says. Codes that fail in
print usually fail here.

```ts
report.print;
// { span: 41, minSideMm: 30, minModuleMm: 0.73, recommendedSideMm: 30, recommendedPx: 355 }
```

---

## Payloads

32 built-in types with the escaping rules that decide whether a code works on a real phone — an
unescaped `;` in a WiFi password silently truncates it; an unfolded 200-character vCard line is
rejected outright by some contact importers.

```ts
import { serializePayload, PAYLOAD_TYPES, getPayloadType } from 'teiqr/payload';

qr(serializePayload('wifi', {
  ssid: 'Pokhara Cafe', encryption: 'WPA', password: 'himalaya2026',
}), { ecc: 'Q' }).png();
```

| Group     | Types                                                       |
| --------- | ----------------------------------------------------------- |
| Web & app | `url` `youtube` `spotify` `app` `pdf` `googleform` `review`  |
| Contact   | `vcard` `vcard4` `mecard`                                   |
| Network   | `wifi`                                                       |
| Messaging | `email` `sms` `phone` `facetime` `whatsapp` `telegram`       |
| Time/place| `geo` `maps` `event`                                        |
| Payments  | `bitcoin` `ethereum` `lightning` `upi` `sepa`               |
| Social    | `instagram` `facebook` `x` `linkedin` `tiktok` `github`      |
| Plain     | `text`                                                       |

Each type declares its own `fields`, so a form UI can be generated from the data rather than
hand-written:

```ts
getPayloadType('wifi').fields;
// [{ name: 'ssid', label: 'Network name', type: 'text', required: true }, …]
```

Ethereum amounts are converted to wei by decimal-string arithmetic with `BigInt` — a double
cannot hold 18 significant digits, and a wallet handed an off-by-one-wei amount is a bug worth
avoiding entirely. The parser converts back the same way.

---

## Extensibility

Every registry is open. Nothing requires forking the package.

**Custom validation rules**

```ts
import { registerValidationRule, BUILTIN_RULES, validate } from 'teiqr/validate';

registerValidationRule({
  id: 'house-min-ecc',
  description: 'Printed codes must be level Q or better.',
  check: ({ matrix }) =>
    matrix.ecc === 'L' || matrix.ecc === 'M'
      ? { level: 'error', code: 'ecc-too-low', title: 'Raise error correction',
          detail: 'Company policy requires level Q or H for printed codes.' }
      : null,
});

validate(matrix, style, { disableRules: ['inverted'] });        // drop one built-in
validate(matrix, style, { rules: [...BUILTIN_RULES, myRule] }); // full control
validate(matrix, style, { penalties: { warning: 5 } });         // reweight the score
```

A rule's `check` receives the matrix, the resolved style, and every derived measurement
(`contrast`, `inverted`, `coverage`, `print`) already computed — so custom rules cost nothing
extra.

**Custom payload types**

```ts
import { registerPayloadType, val } from 'teiqr/payload';

registerPayloadType({
  id: 'asset', label: 'Asset tag', group: 'plain',
  blurb: 'Opens the internal asset register.',
  fields: [{ name: 'id', label: 'Asset ID', type: 'text', required: true }],
  serialize: (v) => `ASSET:${val(v, 'id')}`,
  sample: { id: 'A-1024' },
});
```

Registering an existing id **replaces** it — that is how you override a built-in.

**Custom payload parsers**, so your format decomposes into fields like the built-ins:

```ts
import { registerPayloadParser } from 'teiqr/payload';

registerPayloadParser({
  type: 'asset',
  parse: (text) => (text.startsWith('ASSET:') ? { id: text.slice(6) } : null),
});
```

**Custom Shift-JIS tables** via `registerKanjiTable`, if you only need a subset of the range.

---

## Kanji, ECI and binary

**Kanji** packs a double-byte Shift-JIS character into 13 bits against 24 for the same
character as UTF-8 bytes — a 46% saving on Japanese text. The table is 6,953 code points and
~10.3 kB gzipped, so it is opt-in rather than a tax on every bundle:

```ts
import 'teiqr/kanji';                       // registers the table as a side effect
qr('こんにちは世界', { kanji: true }).svg();  // smaller symbol than byte mode
```

Characters with no Shift-JIS mapping (emoji, for instance) fall back to byte mode
automatically, without breaking the surrounding Kanji run. `encodeMicro` and `encodeRmqr`
take the same `kanji` option; Micro QR offers the mode in M3 and M4 only.

**ECI** declares the charset of what follows. Most scanners already sniff UTF-8 successfully,
and some older readers reject symbols carrying an ECI header, so `teiqr` never emits one
unless asked:

```ts
import { ECI } from 'teiqr/core';
qr('café', { eci: ECI.UTF8 });
```

**Binary** payloads are first-class:

```ts
qr(new Uint8Array([0xde, 0xad, 0xbe, 0xef]), { ecc: 'H' });
scan(png).bytes;   // → the same bytes back
```

---

## Micro QR

A separate, smaller symbology for when a full QR code will not fit — circuit
boards, pharmaceutical blisters, cable labels. An M1 symbol is 11 modules across
where a version-1 QR symbol is 21, under a third of the area.

```ts
import { encodeMicro } from 'teiqr/core';

encodeMicro('12345');                          // M1, 11x11
encodeMicro('HELLO', { ecc: 'M' });            // M2 or larger
encodeMicro('hello', { version: 'M4' });       // byte mode needs M3+
encodeMicro('abc123XYZ');                      // byte + alphanumeric, not all bytes
encodeMicro('漢字', { kanji: true });           // 13 bits a character, not 24
encodeMicro(new Uint8Array([0xde, 0xad]));     // raw binary
```

Text is segmented across modes the same way a full QR symbol is, bounded by what each
version offers: M1 is numeric-only and M2 has no byte mode, so a payload those cannot
describe grows to the next size rather than failing. Kanji needs a registered Shift-JIS
table (`import 'teiqr/kanji'`) and is available in M3 and M4.

The result is an ordinary `QrMatrix` tagged `variant: 'micro'`, so it renders,
rasterises and exports through everything else unchanged.

| Version | Size | Levels | Modes |
| --- | --- | --- | --- |
| M1 | 11x11 | detection only | numeric |
| M2 | 13x13 | L, M | numeric, alphanumeric |
| M3 | 15x15 | L, M | numeric, alphanumeric, byte, Kanji |
| M4 | 17x17 | L, M, Q | numeric, alphanumeric, byte, Kanji |

There is no level H, M1 carries error *detection* rather than correction, and
capacity tops out at 35 digits, 21 alphanumeric characters or 15 bytes — past
that, use a full QR symbol.

> **How this is verified.** Micro QR shares almost nothing with QR beyond
> Reed-Solomon: four mask patterns instead of eight, a different format-info XOR
> mask, narrower count fields, and a four-bit final data codeword in M1 and M3.
> A single wrong table value produces a symbol that round-trips through our own
> decoder perfectly and is rejected by every real scanner. So every version,
> level and mask is compared **module-for-module against an independent
> ISO-conformant implementation** — 612 fixtures, checked on every test run. That caught two real bugs during development: QR's column-direction
> expression, whose arithmetic only holds for QR's 4v+17 sizes, and padding M1
> and M3 with `0xEC`/`0x11` where the standard requires zeros.
>
> Each fixture pins its segmentation explicitly, including mixed-mode and Kanji runs. Two
> encoders can both be correct and still split a string differently, so comparing module
> matrices only means something when both are given the same segments; our own mode
> *selection* is asserted separately, as never being larger than any single-mode encoding.
>
> Decoding is implemented too, and verified the same way: the decoder reads all 612 of those
> independently-produced symbols back to their exact payloads. Round-tripping our own encoder would only prove the
> two halves agree with each other.
>
> M1 is the one asymmetry, and it is the standard's: it carries error *detection* only, so a
> damaged M1 symbol is reported as unreadable rather than repaired.

---

## rMQR — rectangular symbols

For surfaces that are long and thin: test tubes, cable wraps, PCB edges. ISO/IEC 23941 defines
32 fixed rectangles from 7x43 up to 17x139 — the widest is nearly twenty times wider than it is
tall, where neither a square QR nor a Micro QR symbol would fit at all.

```ts
import { encodeRmqr } from 'teiqr/core';

encodeRmqr('SERIAL-4417');                        // flattest symbol that fits
encodeRmqr('https://example.com', { ecc: 'H' });
encodeRmqr('12345', { version: 'R7x43' });        // pin an exact size
encodeRmqr('long payload', { fit: 'area' });      // minimise modules instead of height
encodeRmqr('漢字', { kanji: true });               // 13 bits a character, not 24
encodeRmqr(new Uint8Array([0xde, 0xad]));         // raw binary
```

All four modes are available at every size, and text is segmented across them optimally. The
count-field widths differ between sizes, so the cheapest split of a string at `R7x43` is not
always the cheapest at `R17x139` — the encoder re-plans per size rather than choosing once.

`fit` defaults to `'width'`, which picks the flattest symbol that fits — usually the point of
reaching for rMQR. `'height'` prefers tall and narrow; `'area'` just minimises total modules.

The result is a `QrMatrix` tagged `variant: 'rmqr'` carrying `width` and `height` alongside
`size`, and it renders, rasterises and exports through everything else. Square symbols are
unchanged: they leave `width`/`height` absent and `size` means both, exactly as before.

Structurally it matches neither predecessor: a 7x7 finder top-left and a 5x5 *sub*-finder
bottom-right, corner patterns at the other two corners, alignment patterns along both long
edges, **one** mask pattern rather than eight, and error correction at M or H only.

> **How this is verified, and three bugs it found in the reference.** Every version is compared
> module-for-module against an independent implementation — 507 fixtures, each pinning its
> segmentation so both encoders write the same runs. Where the reference is correct, we match it
> exactly. Three categories are excluded because it is wrong there, not us:
>
> - **Mixed block sizes.** Its interleaver uses `break` where the standard skips an exhausted
>   block and continues, so it silently drops data codewords — one of 73 for R13x99-M, four of
>   76 for R17x139-H. Those symbols cannot decode. A test asserts our interleaving is lossless
>   at every size, since that is the exact bug class.
> - **R17x43-M.** Its table lists a 60-codeword block against that version's own total of 61.
>   The H blocks sum to 61, the module count gives 61x8 + 1 = 489, and 60 - 39 = 21 error
>   correction codewords has no generator polynomial in its own table — which is why it raises
>   `KeyError: 21` on that version. We use 61, giving 22.
> - **R13x27-M.** Its table lists 14 data codewords against its own stated 96 data bits, which
>   is 12. Every other entry in that table has data codewords x 8 equal to its data bits, and
>   the two other 21-codeword sizes both split M as 12 data and 9 error correction while
>   agreeing with R13x27 exactly at H. We use 12. A test now asserts that invariant across all
>   32 sizes and both levels, which is what surfaced this one.
>
> Decoding is implemented too, and reads all 507 of the reference's own symbols correctly. A
> test covers the mixed-block-size versions specifically, since that is where the reference
> loses data, along with the two sizes whose tables we correct.

---

## Structured Append

A single symbol tops out at 2,953 bytes. Structured Append spreads one payload across up to 16
symbols, each carrying its index, the set size, and a parity byte over the *whole* original
payload.

```ts
import { encodeStructured } from 'teiqr/core';
import { joinStructured } from 'teiqr/verify';

const { symbols, count, parity } = encodeStructured(longText, { ecc: 'M' });
symbols.forEach((s, i) => writeFile(`part-${i + 1}.png`, toPng(s, {}, { scale: 10 })));

// Scanned back in any order:
joinStructured(scanned.map((s) => s)).text === longText;
```

Sets are validated before joining: every symbol must agree on the total *and* the parity, and
every index must be present exactly once. The parity check is the one that catches a symbol
accidentally picked up from a **different** set, which index checks alone would miss.

> Reader support is uneven in the wild — phone cameras usually ignore the header and return
> each part separately, while dedicated inventory scanners generally honour it. Prefer a
> single symbol when the payload fits one; `encodeStructured` returns `count: 1` and omits the
> header entirely when it does.

---

## Terminal output

```ts
console.log(qr('https://example.com').terminal());
```

The default uses half-block characters so one text row carries two module rows. Terminal cells
are about twice as tall as they are wide, so this is what makes the output square — the naive
"two spaces per module" approach is correct but twice as tall as it should be, and usually
scrolls off the screen.

```ts
qr(text).terminal({
  style: 'half',   // 'half' | 'block' | 'ascii'
  quietZone: 4,
  invert: false,   // set true on dark-background terminals
});
```

On a dark terminal you need `invert: true` — a scanner expects dark modules on a light field.

---

## Command line

```bash
npx teiqr "https://example.com"                    # prints to the terminal
npx teiqr "https://example.com" -o code.png        # writes a file
npx teiqr scan ticket.png                          # decodes an image
npx teiqr batch wifi.csv -t wifi -o codes.zip    # one code per row
npx teiqr types                                    # list payload types
```

No install needed, and no dependencies pulled in — the argument parser is part of the package,
because adding `commander` would more than double the install size of something whose whole
pitch is that it installs nothing.

**Generating**

```bash
teiqr "text" -o code.svg                # format inferred from the extension
teiqr "text" -o code.pdf --side-mm 40   # print-ready at a real size
teiqr "text" --shape rounded --eye-frame circle --colour '#123a6b'
teiqr "text" --ecc H --scale 12 --quiet-zone 4
teiqr "text" --validate                 # scannability report alongside the code
teiqr --invert "text"                   # for dark-background terminals
```

Build a typed payload without hand-writing its escaping:

```bash
teiqr -t wifi ssid="Pokhara Cafe" password=himalaya2026 -o wifi.png
teiqr -t vcard firstName=Ada lastName=Lovelace email=ada@example.com -o card.svg
```

**Scanning**

```bash
teiqr scan ticket.png                # prints the payload
teiqr scan photo.jpg                 # JPEG too, baseline or progressive
teiqr scan sheet.png --all           # every code in the image
teiqr scan wifi.png --parse          # decomposed into fields
teiqr scan ticket.png --json         # full result, including version and ecc
```

```console
$ teiqr scan wifi.png --parse
WIFI:T:WPA;S:Pokhara Cafe;P:himalaya2026;;
  type: wifi (exact)
  encryption: WPA
  ssid: Pokhara Cafe
  password: himalaya2026
```

**Batch**

The CSV's header names the payload fields; one code comes out per row.

```csv
ssid,password,encryption
Pokhara Cafe,himalaya2026,WPA
Teispace HQ,letmein,WPA
```

```bash
teiqr batch wifi.csv -t wifi -o ./codes         # a directory of PNGs
teiqr batch wifi.csv -t wifi -o codes.zip       # a single archive
teiqr batch guests.csv -t vcard -f svg -o ./out # a different type, so different columns
```

Rows missing a required column are reported by line number and the command exits non-zero,
rather than quietly emitting codes built from sample data:

```console
$ teiqr batch bad.csv -t wifi -o ./out
row 2: missing ssid
1 row(s) are missing required fields. Add the columns, or pass --fill-from-sample to use the type's sample values.
$ echo $?
1
```

Exit codes: `0` success, `1` runtime failure (no code found, unreadable file, incomplete rows),
`2` bad arguments.

---

## React

Plain React — the only peer dependency is `react` itself, and it is optional. No framework
coupling: this works in Vite, Create React App, Remix, Astro, or a bare React app.

```bash
npm install teiqr react
```

```tsx
import { QrCode } from 'teiqr/react';

<QrCode value="https://example.com" size={256} title="Link to example.com" />
```

Every encoding and styling option is a prop:

```tsx
<QrCode
  value={bytes}            // string, Uint8Array, or segments — not text-only
  ecc="H"
  moduleShape="rounded"
  eyeFrame="circle"
  size={256}
  title="Scan to pay"
  className="rounded-xl"   // unrecognised props go straight to the <svg>
  onClick={handleClick}
/>
```

**Real elements, not injected markup.** The component builds actual React elements rather than
generating an SVG string and passing it to `dangerouslySetInnerHTML`. That means it reconciles
normally instead of replacing the whole subtree on every change, it accepts a `ref` and event
handlers, and no interpolated string derived from user input reaches the DOM.

**Server rendering works.** SVG output is deterministic — gradient ids are hashes of the fill,
not counters — so server and client markup match and hydration stays quiet. This is asserted by
test, not assumed.

**Encoding is cached across renders.** Encoding a large symbol is real work, and the common
call site passes an inline object:

```tsx
<QrCode value={url} moduleShape="rounded" />   // a fresh options object every render
```

A `useMemo` keyed on those props would miss every single time, because object identity changes.
`useQrCode` caches on a structural digest of the inputs instead, so inline literals still hit.

### Canvas

```tsx
import { QrCanvas } from 'teiqr/react';
<QrCanvas value="https://example.com" size={256} />
```

Prefer `<QrCode>` unless you are compositing into other canvas content or need `toDataURL` from
the element. When you do need a canvas, this one is **sharp on retina displays by default** —
the backing store is sized in device pixels and the CSS size set separately. Canvas-based QR
components commonly size the bitmap in CSS pixels, so the browser upscales a 256×256 bitmap
onto 512 physical pixels and the module edges smear.

Pixels come from this package's own rasteriser via `putImageData`, so canvas output is
identical to PNG output rather than a second, subtly different drawing path.

### Camera scanning

```tsx
import { useQrScanner } from 'teiqr/react';

function Scanner() {
  const { ref, result, error, scanning, start, stop } = useQrScanner({
    onResult: (r) => console.log(r.text),
    onError: (e) => console.warn(e.message),
    autoStart: true,             // camera starts when the element attaches — the default
    facingMode: 'environment',   // rear camera
    fps: 10,                     // frames analysed per second
    repeatDelayMs: 1500,         // before the same payload fires again
    maxSize: 640,                // frames downscaled before decoding
  });

  if (error) return <p>{error.message}</p>;
  return <video ref={ref} playsInline muted />;
}
```

**The camera starts on its own.** `autoStart` defaults to `true`, so attaching the `ref`
requests camera access — `start()` is for restarting after `stop()`. Pass `autoStart: false`
when the camera should wait for something, which is usually what you want behind a button or
a consent step.

Handles the parts that are easy to get wrong: frames are throttled and downscaled before
decoding (a 1080p frame is far more detail than a decoder needs), the same payload does not
fire sixty times a second, and **every media track is stopped on unmount** — forgetting that is
what leaves the camera indicator light on after a component goes away.

Requires a secure context (HTTPS or localhost); browsers refuse camera access otherwise, and
that refusal is surfaced through `onError` rather than thrown.

### React Server Components

`teiqr/react` carries a `'use client'` directive, which is a React convention rather than a
Next.js one — inert in a plain React app, and what an RSC bundler needs. The build verifies the
directive survives bundling, because Rollup strips module-level directives by default and the
resulting failure surfaces as a confusing error in *your* application, not ours.

For a server-rendered code with no client JavaScript at all, skip the component and render the
string directly:

```tsx
import { renderSvg } from 'teiqr/render';
import { encode } from 'teiqr/core';

const { svg } = renderSvg(encode(url), { moduleShape: 'rounded' });
```

---

## Entry points and bundle size

Import the whole toolkit, or exactly the part you need. Measured with esbuild, minified and
gzipped, by `scripts/measure-bundles.mjs` — run it yourself after `yarn build`:

| Entry             | Gzipped | What it is                                |
| ----------------- | ------: | ----------------------------------------- |
| `teiqr`           | 44.7 kB | everything                                |
| `teiqr/core`      | 11.6 kB | encoding, all three symbologies           |
| `teiqr/render`    |  4.5 kB | scene + SVG                               |
| `teiqr/validate`  |  4.6 kB | scannability analysis                     |
| `teiqr/payload`   |  8.3 kB | 32 typed builders + parsers               |
| `teiqr/export`    | 22.1 kB | PDF, EPS, ZIP, CSV batch                  |
| `teiqr/raster`    | 10.4 kB | DEFLATE + PNG + rasteriser                |
| `teiqr/verify`    | 17.2 kB | decoder + scanner, all three symbologies  |
| `teiqr/terminal`  |  0.4 kB | text output                               |
| `teiqr/kanji`     | 10.8 kB | Shift-JIS table (opt-in)                  |
| `teiqr/jpeg`      |  3.4 kB | JPEG decoder, incl. progressive (opt-in)  |
| `teiqr/react`     | 28.4 kB | components + hooks (`react` external)     |

`core` and `verify` carry the rMQR tables — 32 fixed sizes with no closed form, so they have
to be listed. Importing `encode` alone is 5.5 kB, because a symbol you never build is a symbol
the bundler drops.

Individual functions tree-shake further, and this is measured rather than assumed — the same
script bundles a single import and greps the output for markers that appear only in code it
should have excluded:

| Import | Gzipped | Unrelated code pulled in |
| --- | ---: | --- |
| `encode` | 5.5 kB | none |
| `toPng` | 10.3 kB | none |
| `scan` | 16.2 kB | none |
| `toTerminal` | 0.4 kB | none |
| `parsePayload` | 7.8 kB | none |
| `<QrCode>` | 9.5 kB | none — the camera scanner is not included |
| `useQrScanner` | 17.3 kB | none — the renderer is not included |

Importing `toTerminal` costs 0.4 kB out of a 44.7 kB whole.

Both ESM and CJS are published, with bundled `.d.ts` for each entry point.

---

## Runtime support

| Runtime            | Generate | SVG | PNG | Scan |
| ------------------ | :------: | :-: | :-: | :--: |
| Node ≥ 20.9        |    ✅    | ✅  | ✅  |  ✅  |
| Browsers           |    ✅    | ✅  | ✅  |  ✅  |
| Cloudflare Workers |    ✅    | ✅  | ✅  |  ✅  |
| Deno               |    ✅    | ✅  | ✅  |  ✅  |
| Bun                |    ✅    | ✅  | ✅  |  ✅  |

This is tested, not assumed. A dedicated suite makes `Buffer`, `document`, `window`,
`HTMLCanvasElement` and `Image` **throw on access**, then runs the entire pipeline — encode,
SVG, PNG, data URL, scan, Kanji table, validate, terminal, verify — against that. Anything
reaching for a Node-only or DOM-only global fails loudly.

The built bundle contains no `node:` imports, no `require()`, and no references to `document`,
`window` or `process`.

---

## API reference

### `qr(data, options): QrCode`

`data` is a `string`, `Uint8Array`, or `QrSegment[]`. `options` merges `EncodeOptions` and
`QrStyle`.

| Method                | Returns        |
| --------------------- | -------------- |
| `.svg()`              | `string`       |
| `.png(options?)`      | `Uint8Array`   |
| `.dataUrl(options?)`  | `string`       |
| `.pixels(options?)`   | `RasterResult` |
| `.terminal(options?)` | `string`       |
| `.validate(options?)` | `Validation`   |
| `.verify(options?)`   | `ScanResult`   |
| `.scene()`            | `Scene`        |
| `.matrix`             | `QrMatrix`     |

### Top-level functions

| Function                            | Purpose                                     |
| ----------------------------------- | ------------------------------------------- |
| `clone(image, options?, fields?)`   | read an existing code and rebuild it        |
| `scan(input, options?)`             | decode anything image-shaped                |
| `scanAll(input, options?)`          | every code in one image                     |
| `tryScan(input, options?)`          | `ScanResult \| null`, never throws          |
| `scanAsync(input, options?)`        | adds JPEG/WebP/AVIF via `createImageBitmap` |
| `parsePayload(text)`                | decompose a payload into fields             |
| `joinStructured(results)`           | reassemble a Structured Append set          |

### `QrMatrix`

```ts
{
  size: number;        // modules per side, excluding the quiet zone
  version: number;     // 1-40
  ecc: EccLevel;       // the level actually used, which boostEcc may have raised
  mask: number;        // 0-7
  modules: Uint8Array; // row-major, 1 is dark
  kinds: Uint8Array;   // row-major MODULE kind per cell
}
```

`kinds` tags every module as `DATA`, `FINDER`, `SEPARATOR`, `ALIGNMENT`, `TIMING`, `FORMAT`,
`VERSION` or `DARK`. No other JavaScript QR library exposes this, and three features depend on
it: renderers style finder patterns independently of the body, the validator works out which
modules a logo may safely cover, and the decoder knows which cells carry data.

### Errors

| Error                  | Thrown when                                        |
| ---------------------- | -------------------------------------------------- |
| `QrCapacityError`      | data does not fit the allowed version range        |
| `NotFoundError`        | no symbol could be located in an image             |
| `UncorrectableError`   | a symbol was found but is too damaged to read      |

`QrCapacityError` carries `needed`, `available` and `maxVersion` so you can report the shortfall.

---

## Stability

The package exports a lot of names — the encoder's Galois-field arithmetic and the PNG codec's
CRC are both reachable, from `teiqr/core` and `teiqr/raster`. That is deliberate: this is a
toolkit, and someone building on top of it should not have to vendor a copy of
`computeRemainder` because it was hidden. But it does mean "what is the API" needs an answer,
so here is one.

**Stable.** Everything this README documents. Pre-1.0, semver puts breaking changes in the
patch position, so pin an exact version if that matters — but nothing documented here changes
without the reason appearing in the changelog. That covers `qr()`,
`encode` / `encodeMicro` / `encodeRmqr`, `scan` and its variants, `clone`, `validate`,
`renderSvg`, `toPng`, `exportQr`, the payload builders and parsers, the React components and
hooks, the CLI, and the types those use — `QrMatrix`, `QrStyle`, `ScanResult`, `Validation`
and their fields.

**Exposed internals.** Everything else. Use them — they are tested to the same standard, and
they are exported because hiding them would be worse — but they can change in a minor release
if the implementation needs it. If you depend on one, pin the version and open an issue;
things people actually use get promoted.

Both tiers are frozen by `__tests__/api-surface.test.ts`, which snapshots every export from
every entry point. Adding a name means updating that file in the same commit; removing one
fails the build until it is done deliberately. A policy that nothing checks is a wish.

**Not API at all:** anything under `src/` that no entry point re-exports, the exact bytes of
rendered output (module *placement* is spec-defined and fixed, path rounding and attribute
order are not), and the wording of error messages.

---

## Conformance and testing

**623 tests.** Beyond ordinary unit coverage, the suite pins the claims this README makes:

- **Round trip across the whole parameter space** — all 40 versions, all 4 error correction
  levels, all 8 masks, binary payloads to 2 kB, astral-plane emoji, ECI, hand-built segments.
- **ISO/IEC 18004 conformance** — the N4 penalty brute-forced against the spec text over all
  477,360 cases; mask selection checked against an exhaustive search; BCH(15,5) and BCH(18,6)
  minimum distances verified as 7 and 8; block partitions proven to tile exactly for all 160
  version/level pairs.
- **Error correction** — damage to the per-block limit recovered exactly, one past it rejected;
  spread-versus-concentrated damage pinned.
- **DEFLATE** — verified against Node's `zlib` inflater, including window-edge matches and all
  ten levels.
- **Rasteriser fidelity** — pixel-exact square modules, provably clear quiet zone.
- **Cross-runtime** — the full pipeline with `Buffer`, `document` and `window` throwing.
- **Payload round trips** — `serialize(parse(serialize(v))) === serialize(v)` for every type.
- **Conformance against independent implementations** — 612 Micro QR and 507 rMQR symbols
  produced by other ISO-conformant encoders, compared module for module, each pinning its own
  segmentation so the comparison is about bit layout rather than mode choice.
- **Degraded input** — uneven light, veiling glare, defocus, sensor noise and low contrast,
  each asserted to be a case a single global threshold genuinely fails.
- **JPEG, baseline and progressive** — 4:4:4, 4:2:2, 4:2:0, greyscale and low-quality
  fixtures encoded by other tools entirely, decoded and compared against the exact pixels
  they were made from. A code that merely *scans* proves little; a mis-scaled inverse DCT
  still scans. The progressive files are `jpegtran` conversions of the baseline ones, which
  is lossless — so they must decode **byte-identically**, which no tolerance could assert.
- **PNG in every shape the format allows** — greyscale, truecolour, palette and both alpha
  variants, at every bit depth each permits, interlaced and not, with `tRNS` transparency.
  Every fixture is built by hand from the spec's tables and compressed with Node's zlib, so
  the reader faces bytes this package did not write.
- **Numeric options that cannot mean anything** — `NaN` and `Infinity` are refused at every
  entry point rather than travelling into the output. They used to produce a PDF whose
  `MediaBox` was `[0 0 NaN NaN]`, which CoreGraphics will not open, and SVG coordinates
  reading `NaN`. Zero and negative values still mean something and are still accepted.
- **Malformed input** — truncations, single-byte corruptions, a decompression bomb and pure
  noise, because a decoder reads bytes someone else wrote. A nightly job fuzzes the same
  surface for cases nobody wrote a test for.
- **The public API surface** — every export from every entry point snapshotted, so a change to
  it has to be deliberate.
- **The examples** — all twelve run on every build, and assert what they demonstrate.

Rendered output is additionally validated with an independent decoder, so "it scans" does not
rest on our own decoder agreeing with our own encoder.

### Known limitations

Stated plainly, because a library that hides these wastes your afternoon:

- **Micro QR and rMQR are located under a similarity transform**, not a homography. rMQR pairs
  its finder with the sub-finder in the opposite corner, so scale and rotation are measured
  across the whole diagonal and a moderate tilt reads; Micro QR has one finder and no second
  landmark at all, so it gets position, scale and rotation and nothing more. Neither symbology
  provides the four correspondences perspective needs — a wide rMQR symbol photographed at a
  real angle will not read, and returns nothing rather than a wrong payload. Full QR does get
  perspective correction.
- **Motion blur, moiré and non-flat paper are not simulated.** Uneven lighting, defocus, sensor
  noise and low contrast are, and the scanner is tested against all four; the rest is honest
  guesswork until someone points a real camera at it.
- **Raster output cannot draw frame label text**, and can only embed **PNG** data-URI logos.
  Both are reported in `rasterize().omitted`. SVG handles both fully.
- **WebP and AVIF need `createImageBitmap`** (so, `scanAsync` in a browser, Worker or Deno).
  PNG is decoded natively everywhere, and JPEG — baseline and progressive alike — with
  `import 'teiqr/jpeg'`. Arithmetic-coded and lossless JPEG are refused by name.

---

## License

MIT © Teispace. Free forever, for anything, including commercial use.
