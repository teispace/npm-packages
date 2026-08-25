/**
 * Every styling knob, and the one that matters more than the rest.
 *
 * Shape choices are not purely cosmetic: several of them measurably reduce how
 * reliably a code scans, and the package will tell you which. The tiers at the
 * bottom come from real decode attempts — each variant is rasterised and read
 * back 72 times across sizes and error levels — rather than from taste.
 */
import { qr } from 'teiqr';
import { EYE_FRAME_SAFETY, MODULE_SHAPE_SAFETY } from 'teiqr/render';
import { save, section } from './_shared.mjs';

const url = 'https://example.com/styling';

section('Module shapes');
for (const moduleShape of ['square', 'rounded', 'extra-rounded', 'dot', 'classy', 'fluid']) {
  save(`02-shape-${moduleShape}.svg`, qr(url, { moduleShape }).svg());
}

section('Eyes styled independently of the body');
save(
  '02-eyes.svg',
  qr(url, {
    moduleShape: 'rounded',
    eyeFrame: 'leaf',
    eyeBall: 'dot',
    eyeFrameFill: { kind: 'solid', color: '#c2410c' },
    eyeBallFill: { kind: 'solid', color: '#1d4ed8' },
  }).svg(),
);

section('Gradients');
save(
  '02-gradient.svg',
  qr(url, {
    moduleShape: 'extra-rounded',
    body: {
      kind: 'linear',
      angle: 45,
      stops: [
        { offset: 0, color: '#0f172a' },
        { offset: 1, color: '#2563eb' },
      ],
    },
  }).svg(),
);

section('A frame with a call to action');
save(
  '02-framed.svg',
  qr(url, {
    frame: {
      style: 'label-bottom',
      text: 'SCAN ME',
      background: '#0f172a',
      textColor: '#ffffff',
      border: 1,
      cornerRadius: 3,
      fontFamily: 'Helvetica, Arial, sans-serif',
    },
  }).svg(),
);

section('Which shapes are safe, measured rather than asserted');
for (const [shape, tier] of Object.entries(MODULE_SHAPE_SAFETY)) {
  console.log(`    module ${shape.padEnd(15)} ${tier}`);
}
for (const [frame, tier] of Object.entries(EYE_FRAME_SAFETY)) {
  console.log(`    eye    ${frame.padEnd(15)} ${tier}`);
}
