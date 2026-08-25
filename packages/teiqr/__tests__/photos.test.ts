import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tryScan } from '../src/verify/api.js';

/**
 * Scanning actual photographs, when there are any.
 *
 * The rest of the scanner suite is synthetic: rendered pixels, degraded by
 * code. That covers uneven lighting, defocus, noise and low contrast, and it
 * covers them well enough to have caught two real bugs. What it cannot cover
 * is everything a camera adds that cannot be faithfully faked — motion blur,
 * rolling-shutter skew, JPEG ringing, moiré against a screen, specular
 * highlights, paper that is not flat.
 *
 * So this suite exists and is empty, and says so out loud rather than leaving
 * the gap implicit. Drop PNGs into `fixtures/photos`, list them in
 * `manifest.json`, and they run. See the README there for what is worth
 * photographing.
 */

interface Photo {
  /** File name inside `fixtures/photos`. */
  file: string;
  /** Payload the symbol carries, or null when the image should *not* scan. */
  text: string | null;
  /** How it was taken — lighting, angle, surface. Shown when it fails. */
  note?: string;
}

const directory = join(import.meta.dirname, 'fixtures', 'photos');

const manifest: Photo[] = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));

describe('real photographs', () => {
  it('has a manifest listing every image present, and no more', () => {
    // A photo nobody listed is a photo nobody tests, and a manifest entry with
    // no file is a test that silently never runs. Both fail here.
    const present = readdirSync(directory)
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .sort();
    const listed = manifest.map((photo) => photo.file).sort();
    expect(listed).toEqual(present);
  });

  if (manifest.length === 0) {
    it.skip('scans photographs (none committed yet — see fixtures/photos/README.md)', () => {});
    return;
  }

  for (const photo of manifest) {
    const label = photo.note ? `${photo.file} (${photo.note})` : photo.file;

    it(`reads ${label}`, () => {
      const bytes = readFileSync(join(directory, photo.file));
      const result = tryScan(new Uint8Array(bytes));

      if (photo.text === null) {
        // A photo listed with a null payload is one that must *not* decode.
        // Without a few of these the suite only proves the scanner says yes.
        expect(result, 'expected this image not to scan').toBeNull();
        return;
      }
      expect(result?.text).toBe(photo.text);
    });
  }
});
