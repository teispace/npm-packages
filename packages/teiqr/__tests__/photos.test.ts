import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The photographs are JPEG, because that is what a camera writes.
import '../src/jpeg.js';
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
 * Drop images into `fixtures/photos`, list them in `manifest.json`, and they
 * run. See the README there for what is worth photographing, and
 * `ATTRIBUTION.md` for the licence terms of anything not shot by hand.
 *
 * An entry may also be marked `knownUnread`, meaning: this is a real symbol,
 * a real decoder reads it, and this one does not — yet. Such a case asserts
 * the *current* behaviour and fails the moment it changes, so improving the
 * scanner shows up as a red test asking to be reclassified rather than as
 * silence. A limitation nobody is reminded of is a limitation nobody fixes.
 */

interface Photo {
  /** File name inside `fixtures/photos`. */
  file: string;
  /** Payload the symbol carries, or null when the image should *not* scan. */
  text: string | null;
  /** How it was taken — lighting, angle, surface. Shown when it fails. */
  note?: string;
  /**
   * A symbol this scanner cannot currently read, though the image is sound and
   * another decoder manages it. Pins today's behaviour so the day it improves
   * is impossible to miss.
   */
  knownUnread?: boolean;
}

const directory = join(import.meta.dirname, 'fixtures', 'photos');

const manifest: Photo[] = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));

describe('real photographs', () => {
  it('has a manifest listing every image present, and no more', () => {
    // A photo nobody listed is a photo nobody tests, and a manifest entry with
    // no file is a test that silently never runs. Both fail here.
    const present = readdirSync(directory)
      .filter((name) => /\.(png|jpe?g)$/i.test(name))
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

      if (photo.knownUnread) {
        // Deliberately asserting a failure. If this starts passing, the
        // scanner got better and the manifest entry should lose its
        // `knownUnread` flag — the test failure is the notification.
        expect(
          result,
          `${photo.file} now decodes. The scanner improved: drop knownUnread from the manifest and set text to the payload.`,
        ).toBeNull();
        return;
      }

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
