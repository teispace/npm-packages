import { describe, expect, it } from 'vitest';
import { PAYLOAD_TYPES, serializePayload } from '../src/payload/index.js';
import {
  parseablePayloadTypes,
  parsePayload,
  registerPayloadParser,
} from '../src/payload/parse.js';

describe('payload parsing round trips its own serialisers', () => {
  // The important property is not that the parsed fields look right, but that
  // re-serialising them reproduces the original payload byte for byte. That is
  // what makes "scan an old code, restyle it" safe.
  const parseable = new Set(parseablePayloadTypes());
  const covered = PAYLOAD_TYPES.filter((t) => parseable.has(t.id));

  it('covers most built-in payload types', () => {
    expect(covered.length).toBeGreaterThanOrEqual(20);
  });

  /**
   * Field values to round trip instead of a type's own sample.
   *
   * Only `app` needs one, and the reason is inherent rather than incidental: a
   * static QR code cannot branch on the scanning device, so the type
   * serialises to a single plain URL. Its sample is a generic fallback link,
   * which is genuinely indistinguishable from an ordinary `url` payload and is
   * correctly parsed as one — see the test below. A store link is
   * distinguishable, and that is what is exercised here.
   */
  const OVERRIDES: Record<string, Record<string, string>> = {
    app: { ios: 'https://apps.apple.com/app/id123456789' },
  };

  for (const type of PAYLOAD_TYPES) {
    if (!parseable.has(type.id)) continue;
    it(`round trips ${type.id}`, () => {
      const original = serializePayload(type.id, OVERRIDES[type.id] ?? type.sample);
      const parsed = parsePayload(original);
      expect(parsed.type, `identified ${type.id} as ${parsed.type}`).toBe(type.id);
      expect(serializePayload(parsed.type, parsed.values)).toBe(original);
    });
  }

  it('leaves a generic app fallback link typed as a url, and still lossless', () => {
    // The honest outcome. `clone()` reproduces the payload byte for byte
    // either way; it simply cannot claim a plain link is an app download.
    const original = serializePayload('app', { fallback: 'https://example.com/app' });
    const parsed = parsePayload(original);
    expect(parsed.type).toBe('url');
    expect(serializePayload(parsed.type, parsed.values)).toBe(original);
  });
});

describe('social profile parsing', () => {
  it('reads a profile back from the canonical URL its serialiser writes', () => {
    for (const [id, handle] of [
      ['instagram', 'someone'],
      ['facebook', 'somepage'],
      ['x', 'someone'],
      ['linkedin', 'some-person'],
      ['tiktok', 'someone'],
      ['github', 'someone'],
    ] as const) {
      const original = serializePayload(id, { handle });
      const parsed = parsePayload(original);
      expect(parsed.type, original).toBe(id);
      expect(parsed.values.handle, original).toBe(handle);
      expect(serializePayload(parsed.type, parsed.values)).toBe(original);
    }
  });

  it('recognises the hosts people actually paste, not only the canonical one', () => {
    // A parser that only reads back what its own serialiser writes is close to
    // useless for cloning: the input comes from someone's address bar.
    const cases: [string, string, string][] = [
      ['https://twitter.com/someone', 'x', 'someone'],
      ['https://www.instagram.com/someone', 'instagram', 'someone'],
      ['https://m.facebook.com/somepage', 'facebook', 'somepage'],
      ['https://fb.com/somepage', 'facebook', 'somepage'],
      ['https://www.linkedin.com/in/some-person/', 'linkedin', 'some-person'],
      ['https://www.tiktok.com/@someone', 'tiktok', 'someone'],
      ['https://github.com/someone?tab=repositories', 'github', 'someone'],
    ];
    for (const [url, type, handle] of cases) {
      const parsed = parsePayload(url);
      expect(parsed.type, url).toBe(type);
      expect(parsed.values.handle, url).toBe(handle);
    }
  });

  it('does not mistake a site’s own pages for profiles', () => {
    for (const url of [
      'https://github.com/about',
      'https://x.com/settings',
      'https://instagram.com/explore',
    ]) {
      expect(parsePayload(url).type, url).toBe('url');
    }
  });

  it('leaves deeper paths as plain urls', () => {
    // A repository or a post is not a profile, and typing it as one would make
    // a clone drop everything after the handle.
    for (const url of [
      'https://github.com/someone/some-repo',
      'https://www.tiktok.com/@someone/video/123',
    ]) {
      expect(parsePayload(url).type, url).toBe('url');
    }
  });
});

describe('parsePayload extracts usable fields', () => {
  it('pulls WiFi credentials apart, unescaping delimiters', () => {
    const parsed = parsePayload(String.raw`WIFI:T:WPA;S:My\;Cafe;P:pa\:ss\,word;H:true;;`);
    expect(parsed.type).toBe('wifi');
    expect(parsed.confidence).toBe('exact');
    expect(parsed.values.ssid).toBe('My;Cafe');
    expect(parsed.values.password).toBe('pa:ss,word');
    expect(parsed.values.hidden).toBe('true');
  });

  it('defaults WiFi encryption to WPA when the tag is absent', () => {
    expect(parsePayload('WIFI:S:Open Network;;').values.encryption).toBe('WPA');
  });

  it('reads a vCard including a folded long line', () => {
    const long = 'A note long enough to be folded across several content lines '.repeat(3);
    const source = serializePayload('vcard', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      org: 'Analytical Engines',
      email: 'ada@example.com',
      note: long.trim(),
    });
    const parsed = parsePayload(source);
    expect(parsed.type).toBe('vcard');
    expect(parsed.values.firstName).toBe('Ada');
    expect(parsed.values.lastName).toBe('Lovelace');
    expect(parsed.values.org).toBe('Analytical Engines');
    // Unfolding is the point: a naive split would return a truncated note.
    expect(parsed.values.note).toBe(long.trim());
  });

  it('distinguishes vCard 4.0 from 3.0', () => {
    expect(parsePayload(serializePayload('vcard4', { firstName: 'A', lastName: 'B' })).type).toBe(
      'vcard4',
    );
    expect(parsePayload(serializePayload('vcard', { firstName: 'A', lastName: 'B' })).type).toBe(
      'vcard',
    );
  });

  it('splits a mailto into address, subject and body', () => {
    const parsed = parsePayload('mailto:hi@example.com?subject=Hello%20there&body=Line%20one');
    expect(parsed.type).toBe('email');
    expect(parsed.values.to).toBe('hi@example.com');
    expect(parsed.values.subject).toBe('Hello there');
    expect(parsed.values.body).toBe('Line one');
  });

  it('reads coordinates and a label out of a geo URI', () => {
    const parsed = parsePayload('geo:28.2096,83.9856?q=28.2096%2C83.9856%28Pokhara%29');
    expect(parsed.values.lat).toBe('28.2096');
    expect(parsed.values.lng).toBe('83.9856');
    expect(parsed.values.label).toBe('Pokhara');
  });

  it('recognises specific link types rather than flattening them to a URL', () => {
    expect(parsePayload('https://youtu.be/dQw4w9WgXcQ').type).toBe('youtube');
    expect(parsePayload('https://open.spotify.com/track/abc').type).toBe('spotify');
    expect(parsePayload('https://t.me/someuser').values.username).toBe('someuser');
    expect(parsePayload('https://wa.me/9779800000000?text=Hi').values.phone).toBe('9779800000000');
    expect(parsePayload('https://example.com/file.pdf').type).toBe('pdf');
    expect(parsePayload('https://example.com/plain').type).toBe('url');
  });

  it('marks URL-shape guesses as heuristic and scheme matches as exact', () => {
    expect(parsePayload('https://youtu.be/abc').confidence).toBe('heuristic');
    expect(parsePayload('mailto:a@b.com').confidence).toBe('exact');
    expect(parsePayload('WIFI:S:x;;').confidence).toBe('exact');
  });

  it('falls back to plain text for anything unrecognised', () => {
    const parsed = parsePayload('just some words');
    expect(parsed.type).toBe('text');
    expect(parsed.values.text).toBe('just some words');
    expect(parsed.raw).toBe('just some words');
  });

  it('reads a calendar event, including the all-day flag', () => {
    const source = serializePayload('event', {
      summary: 'Launch',
      start: '2026-09-01T10:00',
      end: '2026-09-01T11:00',
      location: 'Pokhara',
    });
    const parsed = parsePayload(source);
    expect(parsed.type).toBe('event');
    expect(parsed.values.summary).toBe('Launch');
    expect(parsed.values.start).toBe('2026-09-01T10:00');
    expect(parsed.values.location).toBe('Pokhara');
  });

  it('accepts a custom parser ahead of the built-ins', () => {
    registerPayloadParser({
      type: 'text',
      parse: (text) => (text.startsWith('ASSET:') ? { text: text.slice(6) } : null),
    });
    expect(parsePayload('ASSET:1234').values.text).toBe('1234');
    // Unrelated payloads are untouched.
    expect(parsePayload('WIFI:S:x;;').type).toBe('wifi');
  });
});

describe('clone(): read an old code and rebuild it', () => {
  it('preserves the payload exactly and exposes its fields', async () => {
    const { clone, qr } = await import('../src/index.js');
    const original = 'WIFI:T:WPA;S:Pokhara Cafe;P:himalaya2026;;';
    const oldPng = qr(original, { ecc: 'Q' }).png({ scale: 8, background: '#ffffff' });

    const cloned = clone(oldPng, { moduleShape: 'rounded' });
    expect(cloned.payload.type).toBe('wifi');
    expect(cloned.payload.values.ssid).toBe('Pokhara Cafe');
    expect(cloned.payload.values.password).toBe('himalaya2026');
    // The rebuilt code scans to exactly the original string.
    expect(cloned.verify().text).toBe(original);
    // And it is genuinely restyled, not a copy of the input bytes.
    expect(cloned.svg()).toContain('<svg');
    expect(cloned.source.version).toBeGreaterThan(0);
  });

  it('rebuilds from edited fields without retyping the rest', async () => {
    const { clone, qr } = await import('../src/index.js');
    const oldPng = qr('WIFI:T:WPA;S:Pokhara Cafe;P:himalaya2026;;').png({
      scale: 8,
      background: '#ffffff',
    });

    const old = clone(oldPng);
    const updated = clone(
      oldPng,
      { moduleShape: 'dot' },
      {
        ...old.payload.values,
        password: 'a-new-password',
      },
    );

    expect(updated.verify().text).toBe('WIFI:T:WPA;S:Pokhara Cafe;P:a-new-password;;');
  });

  it('carries the original error correction level across', async () => {
    const { clone, qr } = await import('../src/index.js');
    const png = qr('https://example.com', { ecc: 'H', boostEcc: false }).png({
      scale: 8,
      background: '#ffffff',
    });
    expect(clone(png).matrix.ecc).toBe('H');
  });

  it('preserves a payload no parser recognises', async () => {
    const { clone, qr } = await import('../src/index.js');
    const odd = 'SOMEPROPRIETARY|format|1234';
    const png = qr(odd).png({ scale: 8, background: '#ffffff' });
    const cloned = clone(png, { moduleShape: 'fluid' });
    expect(cloned.payload.type).toBe('text');
    expect(cloned.verify().text).toBe(odd);
  });
});

describe('the escape character survives a round trip', () => {
  // Every reserved character was reversible except the backslash itself:
  // `escapeWifi` escaped it, because it has to, and `unescapeWifi` did not
  // reverse it, so a value containing one came back with it doubled. A WiFi
  // password with a backslash in it was silently corrupted by clone().
  //
  // Round-tripping only the "interesting" delimiters is what hid it — the
  // escape character is the one nobody thinks to include in that list.
  const AWKWARD = [
    'back\\slash',
    'two\\\\backslashes',
    'trailing\\',
    '\\leading',
    'mixed;semi',
    'all;of:them,"here"',
    'C:\\Users\\guest',
  ];

  it('round trips WiFi values containing backslashes', () => {
    for (const ssid of AWKWARD) {
      const wire = serializePayload('wifi', { ssid, password: ssid, encryption: 'WPA' });
      const parsed = parsePayload(wire);
      expect(parsed.type, wire).toBe('wifi');
      expect(parsed.values.ssid, wire).toBe(ssid);
      expect(parsed.values.password, wire).toBe(ssid);
      // And the whole payload re-serialises to exactly what was scanned.
      expect(serializePayload('wifi', parsed.values)).toBe(wire);
    }
  });

  it('round trips MeCard values containing backslashes', () => {
    for (const name of AWKWARD) {
      // `firstName` is required, and supplying it is the point rather than
      // noise: this test used to build a MeCard with no name at all, which
      // serialised happily to `MECARD:N:,;;`. The escaping was what was under
      // test, so the incompleteness went unnoticed until serialisation started
      // refusing it.
      const wire = serializePayload('mecard', {
        firstName: 'Ada',
        lastName: name,
        phone: '+1234',
      });
      const parsed = parsePayload(wire);
      expect(parsed.values.lastName, wire).toBe(name);
      expect(serializePayload('mecard', parsed.values)).toBe(wire);
    }
  });

  it('round trips vCard values containing backslashes', () => {
    for (const org of AWKWARD) {
      const wire = serializePayload('vcard', { firstName: 'A', lastName: 'B', org });
      expect(parsePayload(wire).values.org, wire).toBe(org);
    }
  });
});

/**
 * A payload with its required fields missing is not a payload.
 *
 * `serializePayload('url', {})` used to return the empty string, which encodes
 * as a QR code carrying nothing. `'review'` returned a Google review link with
 * no place attached, `'vcard'` a contact card with no name, `'wifi'` a network
 * with no SSID. Every one of them scannable, every one useless, and none of
 * them complaining — thirty-one of the thirty-two built-in types behaved this
 * way.
 *
 * The field metadata always said which fields were required, and
 * `isPayloadComplete` could always check it. Only this function never asked,
 * while `planBatch` did — which is why a CSV row missing a column has always
 * been reported rather than silently turned into a code pointing nowhere.
 */
describe('required fields are required', () => {
  it('refuses every built-in type when its required fields are absent', () => {
    const types = PAYLOAD_TYPES.filter((type) => type.fields.some((f) => f.required));
    // Guards the loop against passing vacuously if the metadata ever empties.
    expect(types.length).toBeGreaterThan(25);

    for (const type of types) {
      expect(() => serializePayload(type.id, {}), type.id).toThrow(/is required|are required/);
    }
  });

  it('names the type and the field, so the message is useful anywhere', () => {
    expect(() => serializePayload('wifi', { password: 'x' })).toThrow(
      'Cannot build a wifi payload: ssid is required.',
    );
    expect(() => serializePayload('vcard', { lastName: 'Lovelace' })).toThrow(/firstName/);
  });

  it('treats an empty or whitespace-only value as absent', () => {
    // A required field present but empty is the case that produced
    // `WIFI:T:WPA;S:;;` — technically populated, actually not.
    expect(() => serializePayload('wifi', { ssid: '' })).toThrow(/ssid is required/);
  });

  it('still serialises the moment the required fields are there', () => {
    expect(serializePayload('wifi', { ssid: 'Cafe' })).toContain('S:Cafe');
    expect(serializePayload('url', { url: 'https://example.com' })).toBe('https://example.com');
  });

  it('every built-in sample is complete enough to serialise', () => {
    // The samples are what `--fill-from-sample` and the docs offer, so a
    // sample that cannot itself be serialised would be a broken promise.
    for (const type of PAYLOAD_TYPES) {
      expect(() => serializePayload(type.id, type.sample), type.id).not.toThrow();
    }
  });

  it('refuses a type it does not know instead of returning an empty string', () => {
    expect(() => serializePayload('not-a-type', { a: 'b' })).toThrow(/Unknown payload type/);
  });
});
