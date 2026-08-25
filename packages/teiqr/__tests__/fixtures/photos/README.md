# Real photographs

This directory is empty on purpose, and that is the point.

Every other scanner test in this package feeds the decoder pixels the package
rendered itself — exact colours, hard edges, uniform light — and then degrades
them synthetically. `degradation.test.ts` simulates uneven lighting, defocus,
sensor noise and low contrast, which is enough to prove the binariser works and
to catch a regression. It is not the same as a photograph.

What simulation does not cover: motion blur, rolling-shutter skew, chromatic
aberration, JPEG ringing, moiré against a screen, specular highlights, and paper
that is not flat. Those are the things that actually defeat scanners in the
field, and none of them are in the test suite because none of them can be
faithfully faked.

## Adding photos

Drop image files in here and add a line to `manifest.json` for each. The suite
in `__tests__/photos.test.ts` picks them up automatically and skips cleanly when
the directory is empty, so nothing breaks for a contributor who has none.

```json
[
  { "file": "printed-flat.png", "text": "https://example.com", "note": "laser-printed A4, desk lamp" },
  { "file": "screen-angle.png", "text": "https://example.com", "note": "phone screen, ~30 degrees" }
]
```

**PNG only.** The package decodes PNG natively everywhere; JPEG needs
`createImageBitmap`, which Node does not provide, so a JPEG fixture would skip
on the machines that matter. Convert before committing.

## What is worth photographing

Aim for the cases the simulation cannot reach, and for ones expected to *fail* —
a scanner that never says no is not a scanner.

- Printed on paper, flat, good light. The baseline; if this fails nothing else matters.
- The same code at 20, 40 and 60 degrees off-axis.
- On a phone or monitor screen, which brings moiré and backlight.
- Under a hard shadow, and with a specular highlight across one corner.
- Slightly out of focus, and with visible hand shake.
- Curved — around a bottle or a cable, which no homography can undo.
- Crumpled or torn, to check error correction against real damage.
- Something that is not a QR code at all, to confirm it is rejected.

Keep them small. A few hundred kilobytes each is plenty at these sizes, and this
directory lives in the repository forever.
