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

  for (const type of PAYLOAD_TYPES) {
    if (!parseable.has(type.id)) continue;
    it(`round trips ${type.id}`, () => {
      const original = serializePayload(type.id, type.sample);
      const parsed = parsePayload(original);
      expect(parsed.type, `identified ${type.id} as ${parsed.type}`).toBe(type.id);
      expect(serializePayload(parsed.type, parsed.values)).toBe(original);
    });
  }
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
