# teiqr

**The complete QR toolkit — generate, style, validate, and scan.** Zero dependencies, one
synchronous API, identical output in Node, browsers, Cloudflare Workers, Deno and Bun.

```bash
npm install teiqr
```

```ts
import { qr, scan } from 'teiqr';

qr('https://example.com').svg();                  // → '<svg …>'
qr('https://example.com').png({ scale: 12 });     // → Uint8Array (no canvas)
scan(pngBytes).text;                              // → 'https://example.com'
```

---

## Why this exists

The most-downloaded QR library on npm was last published in **August 2024**, is CJS-only,
ships no TypeScript types of its own, and has 86 open issues. The most popular *styling*
library is also CJS-only and needs a native `node-canvas` build to work on a server. One
widely-used alternative is GPL-3.0, which quietly rules it out of most commercial work.

None of them can scan. All of them make you install a second library to do it.

`teiqr` is one MIT-licensed package that does the whole job:

|                              | teiqr | `qrcode` | `qr-code-styling` | `qrcode.react` | `uqr` |
| ---------------------------- | :---: | :------: | :---------------: | :------------: | :---: |
| Generate                     |  ✅   |    ✅    |        ✅         |       ✅       |  ✅   |
| **Decode / scan**            |  ✅   |    ❌    |        ❌         |       ❌       |  ❌   |
| Styled modules & eyes        |  ✅   |    ❌    |        ✅         |       ❌       |  ❌   |
| PNG without a canvas         |  ✅   |    ❌    |        ❌         |       ❌       |  ❌   |
| Scannability validation      |  ✅   |    ❌    |        ❌         |       ❌       |  ❌   |
| Kanji · ECI · Structured Append | ✅ |    ❌    |        ❌         |       ❌       |  ❌   |
| ESM + CJS + bundled types    |  ✅   |    ❌    |        ❌         |       ✅       |  ✅   |
| Runtime dependencies         | **0** |    7     |         1         |       0        |   0   |
| License                      |  MIT  |   MIT    |        MIT        |      ISC       |  MIT  |

<sub>Registry data checked August 2026. `qrious` (GPL-3.0) and `qr-image` (last published 2016) omitted.</sub>

### Three things no other JavaScript QR library does

**1. It tells you the truth about logos.** The usual advice — "keep a logo under 30% at level
H" — is wrong in both directions. Error correction is applied *per Reed-Solomon block*, not
across the symbol, so damage concentrated in one block can kill a code covering far less than
30%, while evenly spread damage survives much more. `teiqr` walks the real module placement
order and the real interleave map and gives you the exact number.

**2. It can prove a code scans.** Because the decoder ships in the same package, a styled,
logo-bearing symbol can be rasterised and read back in-process. `verify()` is not an estimate.

**3. Its mask selection is spec-conformant.** ISO/IEC 18004 Table 11 feature 4 scores the
deviation of dark modules from 50% in *complete 5% steps, symmetrically*. Brute-forcing all
477,360 `(dark, total)` pairs across all 40 versions:

```
node-qrcode disagrees with the spec on : 238,736 / 477,360  (50.0%)
teiqr      disagrees with the spec on : 0        / 477,360  ( 0.0%)
```

Both still scan — but only one follows the standard. This is pinned by a regression test.

---

## Contents

- [Quick start](#quick-start) · [Encoding](#encoding) · [Styling](#styling) · [Output formats](#output-formats)
- [Scanning](#scanning) · [Cloning an existing code](#cloning-an-existing-code) · [Validation](#validation)
- [Payloads](#payloads) · [Extensibility](#extensibility)
- [Kanji, ECI, binary](#kanji-eci-and-binary) · [Structured Append](#structured-append) · [Terminal](#terminal-output)
- [Entry points & bundle size](#entry-points-and-bundle-size) · [Runtime support](#runtime-support)
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

**Optimal segmentation is automatic.** Mode switching costs a 4-bit indicator plus a count
field, so the cheapest encoding of a string is rarely one mode throughout. `teiqr` runs a
Viterbi pass over numeric, alphanumeric, byte and Kanji modes in exact sixth-of-a-bit
arithmetic, so `https://example.com/order/1234567890` encodes as byte + numeric rather than
all-byte. This routinely saves a whole version.

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

ZXing-family decoders verify a finder pattern by checking its 1:1:3:1:1 ratio horizontally,
vertically **and diagonally**. A circular eye core measures 3.0 across its diagonal where a
square measures 4.24, so the diagonal check fails. Modern phone cameras use ML detection and
tolerate it; older and cheaper hardware does not.

Rather than guess, every variant was rendered and decoded with jsQR (a ZXing-derived decoder)
across 3 payloads × 4 error correction levels × 6 module scales — **72 decode attempts each**:

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
automatically, without breaking the surrounding Kanji run.

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

## Entry points and bundle size

Import the whole toolkit, or exactly the part you need. Measured with esbuild, minified, gzipped:

| Entry             | Gzipped | What it is                                |
| ----------------- | ------: | ----------------------------------------- |
| `teiqr`           | 33.5 kB | everything                                |
| `teiqr/core`      |  7.0 kB | encoding only                             |
| `teiqr/render`    |  4.4 kB | scene + SVG                               |
| `teiqr/validate`  |  4.6 kB | scannability analysis                     |
| `teiqr/payload`   |  8.0 kB | 32 typed builders + parsers               |
| `teiqr/raster`    |  9.1 kB | DEFLATE + PNG + rasteriser                |
| `teiqr/verify`    |  8.8 kB | decoder + scanner                         |
| `teiqr/terminal`  |  0.4 kB | text output                               |
| `teiqr/kanji`     | 10.8 kB | Shift-JIS table (opt-in)                  |

Individual functions tree-shake further — `encode` alone is **5.3 kB**, `toPng` **9.0 kB**,
`scan` **8.1 kB**.

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

## Conformance and testing

**148 tests.** Beyond ordinary unit coverage, the suite pins the claims this README makes:

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

The rendered output is additionally validated with **jsQR**, an independent ZXing-derived
decoder, so "it scans" does not rest on our own decoder agreeing with our own encoder.

### Known limitations

Stated plainly, because a library that hides these wastes your afternoon:

- **The scanner assumes an axis-aligned, unskewed image.** It is built to verify rendered
  output, not to decode photographs — there is no perspective correction. For camera input,
  use a dedicated scanner.
- **Raster output cannot draw frame label text**, and can only embed **PNG** data-URI logos.
  Both are reported in `rasterize().omitted`. SVG handles both fully.
- **JPEG/WebP/AVIF decoding needs `createImageBitmap`** (so, `scanAsync` in a browser, Worker
  or Deno). PNG is decoded natively everywhere.
- **Micro QR and rMQR are not implemented.**

---

## License

MIT © Teispace. Free forever, for anything, including commercial use.
