# teiqr examples

Twelve runnable programs covering the whole API, and a browser demo with no
build step.

```bash
yarn install
yarn workspace teiqr run build     # the examples import the built package
yarn workspace teiqr-examples start
```

Every example writes to `out/` and prints what it did. Open the SVGs, and scan
the PNGs with a phone — they are real codes.

## Why these fail the build

Examples rot faster than anything else in a repository. They are the first
thing an API change breaks and the last thing anyone runs, so they drift into
being confidently wrong. Each of these **asserts what it demonstrates** rather
than merely printing it, and `run-all.mjs` runs the lot. An example that no
longer works is a failing build.

That is not theoretical. Writing these found three real bugs in the package:

- `clone(png, style, { password: 'new' })` **silently dropped every other
  field**, so cloning a WiFi code to change its password produced one with no
  SSID — which then no longer parsed as WiFi at all. The `fields` argument was
  being serialised on its own instead of over the parsed values.
- A **backslash in a WiFi or MeCard value did not survive a round trip**. Both
  escapers escaped it, correctly, and neither unescaper reversed it, so it came
  back doubled. Every other reserved character worked, which is exactly why it
  went unnoticed — the escape character is the one nobody puts in the test list.
- MeCard's compound fields were **unescaped twice**, which was invisible while
  the unescaper ignored backslashes and destroyed them once it stopped.

## The examples

| | What it covers |
| --- | --- |
| `01-basics` | `qr()`, every output format, what the encoder decided |
| `02-styling` | shapes, eyes, gradients, frames, and which are measurably safe |
| `03-formats` | SVG, PNG, PDF and EPS at a real physical size |
| `04-validation` | `validate()` vs `verify()`, and honest logo damage figures |
| `05-scanning` | every input shape, multiple codes per image, damage repair |
| `06-cloning` | read an old code into fields, edit one, restyle it |
| `07-payloads` | all 32 types, escaping, what can and cannot be read back |
| `08-symbologies` | Micro QR and rMQR, encoded, rendered and scanned |
| `09-advanced` | Kanji, ECI, binary payloads, Structured Append |
| `10-batch` | CSV in, column matching, ZIP and manifest out |
| `11-cli` | the real binary, driven as a shell would |
| `12-server` | a `fetch` handler for Node, Workers, Deno and Bun |

Run one on its own with `node src/05-scanning.mjs`.

## Browser

```bash
yarn workspace teiqr-examples serve
# http://localhost:8080
```

Generate with live validation, and scan with the camera. It loads `teiqr`
straight from `dist/` through an import map — **no bundler, no framework, no
build step**. That is the point rather than a shortcut: a package that needs a
toolchain to run in a browser is not really dependency-free, and demonstrating
it with Vite would hide exactly the property worth showing.

Camera access needs HTTPS or localhost; the server binds to localhost, which
browsers accept.

The camera loop here is hand-rolled to keep the page framework-free.
`useQrScanner` from `teiqr/react` does the same thing and also handles
throttling, downscaling, and releasing the camera on unmount — which is what
leaves the indicator light on when a component forgets.

## Notes

`out/` is generated and git-ignored. `yarn workspace teiqr-examples clean`
removes it.

The examples import the **built** package, not `src/`, so they exercise what a
consumer actually installs — including the minified error names, which is why
`04-validation` uses `error.name` rather than `error.constructor.name`.
