import { describe, expect, it } from 'vitest';
import { type CliIo, run } from '../src/cli/run.js';
import {
  getPayloadType,
  PAYLOAD_GROUPS,
  redactPayloadValues,
  SECRET_MASK,
  sensitiveFieldsIn,
  serializePayload,
} from '../src/payload/index.js';
import { parsePayload } from '../src/payload/parse.js';
import { normalizeOtpSecret, validateOtpauth } from '../src/payload/security.js';
import { payloadFieldProps } from '../src/react/payload-field-props.js';

/** 20 bytes of Base32, the length RFC 4226 recommends. */
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const base = { issuer: 'Example', account: 'you@example.com', secret: SECRET };

const errors = (values: Record<string, string>) =>
  validateOtpauth(values).filter((p) => p.level === 'error');

describe('otpauth serialisation', () => {
  it('is registered in its own Security group', () => {
    const type = getPayloadType('otpauth');
    expect(type?.label).toBe('Authenticator (2FA)');
    expect(type?.minEcc).toBe('M');
    expect(PAYLOAD_GROUPS.find((g) => g.group === 'security')?.types.map((t) => t.id)).toEqual([
      'otpauth',
    ]);
  });

  it('writes a TOTP key URI with the issuer in the label and as a parameter', () => {
    expect(serializePayload('otpauth', base)).toBe(
      `otpauth://totp/Example:you%40example.com?secret=${SECRET}&issuer=Example`,
    );
  });

  it('omits every parameter that equals its default', () => {
    const uri = serializePayload('otpauth', {
      ...base,
      kind: 'totp',
      algorithm: 'sha1',
      digits: '6',
      period: '30',
    });
    expect(uri).not.toMatch(/algorithm|digits|period/);
  });

  it('writes the parameters that differ from the defaults', () => {
    const uri = serializePayload('otpauth', {
      ...base,
      algorithm: 'sha256',
      digits: '8',
      period: '60',
    });
    expect(uri).toContain('&algorithm=SHA256&digits=8&period=60');
  });

  it('writes a HOTP counter and no period', () => {
    const uri = serializePayload('otpauth', { ...base, kind: 'hotp', counter: '7', period: '60' });
    expect(uri).toBe(
      `otpauth://hotp/Example:you%40example.com?secret=${SECRET}&issuer=Example&counter=7`,
    );
  });

  it('percent-encodes the label and issuer', () => {
    const uri = serializePayload('otpauth', { ...base, issuer: 'Big Co & Sons', account: 'a b' });
    expect(uri).toContain('otpauth://totp/Big%20Co%20%26%20Sons:a%20b?');
    expect(uri).toContain('&issuer=Big%20Co%20%26%20Sons');
  });

  it('normalises the secret the way services display it', () => {
    expect(normalizeOtpSecret(' jbsw y3dp ehpk 3pxp ==')).toBe('JBSWY3DPEHPK3PXP');
    const spaced = SECRET.toLowerCase().replace(/(.{4})/g, '$1 ');
    expect(serializePayload('otpauth', { ...base, secret: spaced })).toContain(`secret=${SECRET}&`);
  });

  it.each([
    ['a secret outside the Base32 alphabet', { secret: 'JBSWY3DPEHPK3PX1' }, 'secret'],
    ['a secret of impossible length', { secret: `${SECRET}A` }, 'secret'],
    ['a colon in the issuer', { issuer: 'Ex:ample' }, 'issuer'],
    ['a colon in the account', { account: 'you:me' }, 'account'],
    ['a period below 15 seconds', { period: '10' }, 'period'],
    ['a period above 300 seconds', { period: '301' }, 'period'],
    ['a fractional period', { period: '30.5' }, 'period'],
    ['an unknown algorithm', { algorithm: 'MD5' }, 'algorithm'],
    ['seven digits', { digits: '7' }, 'digits'],
    ['an unknown kind', { kind: 'motp' }, 'kind'],
    ['HOTP without a counter', { kind: 'hotp' }, 'counter'],
    ['a negative counter', { kind: 'hotp', counter: '-1' }, 'counter'],
  ])('refuses %s', (_name, change, field) => {
    const values = { ...base, ...change };
    expect(errors(values).map((p) => p.field)).toContain(field);
    expect(() => serializePayload('otpauth', values)).toThrow(TypeError);
  });

  it('never echoes the secret in an error', () => {
    const secret = 'NOTBASE32SECRET!';
    expect(() => serializePayload('otpauth', { ...base, secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });

  it('warns about, but still builds, a short secret so existing codes can be cloned', () => {
    // 16 characters is 10 bytes: below RFC 4226's floor, yet still issued.
    const values = { ...base, secret: 'JBSWY3DPEHPK3PXP' };
    expect(validateOtpauth(values)).toEqual([
      expect.objectContaining({ field: 'secret', level: 'warning' }),
    ]);
    expect(serializePayload('otpauth', values)).toContain('secret=JBSWY3DPEHPK3PXP&');
  });

  it('accepts the sample with no problems at all', () => {
    const sample = getPayloadType('otpauth')?.sample ?? {};
    expect(validateOtpauth(sample)).toEqual([]);
  });
});

describe('otpauth parsing', () => {
  it('round trips TOTP and HOTP variants exactly', () => {
    for (const values of [
      base,
      { ...base, algorithm: 'SHA512', digits: '8', period: '15' },
      { ...base, kind: 'hotp', counter: '0' },
      { ...base, issuer: 'Big Co & Sons', account: 'a b+c@example.com' },
    ]) {
      const uri = serializePayload('otpauth', values);
      const parsed = parsePayload(uri);
      expect(parsed.type).toBe('otpauth');
      expect(parsed.confidence).toBe('exact');
      expect(serializePayload(parsed.type, parsed.values)).toBe(uri);
    }
  });

  it('fills in the defaults, so a form shows what the app will use', () => {
    expect(parsePayload(serializePayload('otpauth', base)).values).toEqual({
      kind: 'totp',
      ...base,
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });

  it('reads the scheme and parameters case-insensitively and tolerates padding', () => {
    const parsed = parsePayload(
      `OTPAUTH://TOTP/Example:you?secret=${SECRET.toLowerCase()}==&issuer=Example&algorithm=sha256`,
    );
    expect(parsed.values).toMatchObject({ kind: 'totp', secret: SECRET, algorithm: 'SHA256' });
  });

  it('prefers the issuer parameter over the label prefix', () => {
    const parsed = parsePayload(`otpauth://totp/Old:you?secret=${SECRET}&issuer=New`);
    expect(parsed.values).toMatchObject({ issuer: 'New', account: 'you' });
  });

  it('splits the label on the first colon, encoded or not, and trims the account', () => {
    expect(parsePayload(`otpauth://totp/Acme%3A%20you?secret=${SECRET}`).values).toMatchObject({
      issuer: 'Acme',
      account: 'you',
    });
    expect(parsePayload(`otpauth://totp/you@example.com?secret=${SECRET}`).values).toMatchObject({
      account: 'you@example.com',
    });
  });

  it('does not claim an unknown kind or an oversized label', () => {
    expect(parsePayload(`otpauth://motp/x?secret=${SECRET}`).type).not.toBe('otpauth');
    expect(parsePayload(`otpauth://totp/${'a'.repeat(257)}?secret=${SECRET}`).type).not.toBe(
      'otpauth',
    );
  });

  it('says why a Google Authenticator export cannot be decomposed', () => {
    const parsed = parsePayload('otpauth-migration://offline?data=CjEKCkhlbGxvId%2B');
    expect(parsed.type).toBe('text');
    expect(parsed.unsupported).toMatch(/otpauth-migration/);
  });
});

describe('sensitive fields', () => {
  it('marks the authenticator secret and the WiFi password, and nothing else', () => {
    const sensitive = ['otpauth', 'wifi'].flatMap((id) =>
      (getPayloadType(id)?.fields ?? []).filter((f) => f.sensitive).map((f) => `${id}.${f.name}`),
    );
    expect(sensitive).toEqual(['otpauth.secret', 'wifi.password']);
  });

  it('redacts only fields that carry a value', () => {
    expect(sensitiveFieldsIn('wifi', { ssid: 'Cafe' })).toEqual([]);
    expect(redactPayloadValues('otpauth', base)).toEqual({ ...base, secret: SECRET_MASK });
  });

  it('renders as a password input with autocomplete off, and can be revealed', () => {
    const field = getPayloadType('otpauth')?.fields.find((f) => f.name === 'secret');
    if (!field) throw new Error('no secret field');
    expect(payloadFieldProps(field)).toMatchObject({
      name: 'secret',
      type: 'password',
      autoComplete: 'off',
      spellCheck: false,
      required: true,
    });
    expect(payloadFieldProps(field, { reveal: true }).type).toBe('text');
    const issuer = getPayloadType('otpauth')?.fields.find((f) => f.name === 'issuer');
    expect(issuer && payloadFieldProps(issuer)).toEqual({
      name: 'issuer',
      required: true,
      type: 'text',
    });
  });
});

describe('the CLI never prints a credential unless asked', () => {
  // A canary: a value distinctive enough that finding it anywhere in the
  // output can only mean it leaked.
  const CANARY = 'CANARYCANARYCANARYCANARYCANARY77';

  const harness = (files: Record<string, Uint8Array> = {}) => {
    const fs = new Map(Object.entries(files));
    let out = '';
    const io: CliIo = {
      stdout: (t) => {
        out += t;
      },
      stderr: (t) => {
        out += t;
      },
      readFile: async (p) => {
        const f = fs.get(p);
        if (!f) throw new Error(`ENOENT: ${p}`);
        return f;
      },
      writeFile: async (p, d) => {
        fs.set(p, d);
      },
      mkdir: async () => {},
    };
    return {
      io,
      fs,
      get out() {
        return out;
      },
    };
  };

  const code = async () => {
    const h = harness();
    const status = await run(
      ['-t', 'otpauth', 'issuer=Example', 'account=you', `secret=${CANARY}`, '-o', 'c.png'],
      h.io,
    );
    expect(status).toBe(0);
    expect(h.out).not.toContain(CANARY);
    return h.fs.get('c.png') as Uint8Array;
  };

  it.each([
    [['scan', 'c.png']],
    [['scan', 'c.png', '--parse']],
    [['scan', 'c.png', '--json']],
    [['scan', 'c.png', '--json', '--parse']],
  ])('masks it in `teiqr %s`', async (argv) => {
    const h = harness({ 'c.png': await code() });
    expect(await run(argv, h.io)).toBe(0);
    expect(h.out).not.toContain(CANARY);
    expect(h.out).toMatch(/secret|redacted/);
  });

  it('prints it with --reveal', async () => {
    const h = harness({ 'c.png': await code() });
    await run(['scan', 'c.png', '--parse', '--reveal'], h.io);
    expect(h.out).toContain(`secret: ${CANARY}`);
  });

  it('keeps it out of batch output and filenames', async () => {
    const csv = `issuer,account,secret\nExample,you,${CANARY}\n`;
    const h = harness({ 'in.csv': new TextEncoder().encode(csv) });
    expect(await run(['batch', 'in.csv', '-t', 'otpauth', '-o', 'out'], h.io)).toBe(0);
    expect(h.out).not.toContain(CANARY);
    expect([...h.fs.keys()].join('\n')).not.toContain(CANARY);
  });

  it("refuses an error correction level below the type's minimum", async () => {
    const h = harness();
    const argv = ['-t', 'otpauth', 'issuer=Example', 'account=you', `secret=${CANARY}`];
    expect(await run([...argv, '-e', 'L', '-o', 'c.png'], h.io)).toBe(2);
    expect(h.out).toContain('below the minimum M');
    expect(h.out).not.toContain(CANARY);
  });
});
