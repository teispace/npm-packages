import { EXAMPLE_ACCOUNT, EXAMPLE_OTP_SECRET } from './samples.js';
import type { PayloadType, PayloadValues } from './types.js';
import { val } from './types.js';

/**
 * Authenticator enrolment codes — the Key URI format every TOTP/HOTP app reads
 * (`otpauth://totp/Issuer:account?secret=…&issuer=Issuer`).
 *
 * The code carries a shared secret. Anyone who photographs it can generate the
 * same one-time passwords for as long as the account keeps that secret, so the
 * secret field is marked `sensitive`: the CLI masks it, and form helpers render
 * it as a password input.
 */

export type OtpauthProblem = {
  /** The field the problem is about. */
  field: string;
  /**
   * `error`: an authenticator app would refuse the code or compute the wrong
   * passwords, so `serializePayload` refuses it too. `warning`: it works, but
   * falls short of what the RFCs recommend.
   */
  level: 'error' | 'warning';
  /** Never includes the secret itself. */
  message: string;
};

const ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'];
const DIGITS = ['6', '8'];
const BASE32 = /^[A-Z2-7]+$/;
const INTEGER = /^\d+$/;

/** Defaults the Key URI format assumes when a parameter is absent. */
export const OTPAUTH_DEFAULTS = {
  kind: 'totp',
  algorithm: 'SHA1',
  digits: '6',
  period: '30',
} as const;

/**
 * Normalise a Base32 secret as services display it: upper-case, without the
 * spaces used to group it or the `=` padding. Anything else is left for
 * {@link validateOtpauth} to reject.
 */
export const normalizeOtpSecret = (secret: string): string =>
  secret.toUpperCase().replace(/[\s=]/g, '');

/**
 * Check authenticator values without building the code.
 *
 * Returns every problem rather than the first, so a form can mark each field.
 * A secret shorter than 16 bytes is a warning, not an error: RFC 4226 asks for
 * at least 128 bits, but services still issue 80-bit secrets, and refusing them
 * would make an existing code impossible to clone.
 */
export const validateOtpauth = (values: PayloadValues): OtpauthProblem[] => {
  const problems: OtpauthProblem[] = [];
  const error = (field: string, message: string) =>
    problems.push({ field, level: 'error', message });

  const kind = (val(values, 'kind') || OTPAUTH_DEFAULTS.kind).toLowerCase();
  if (kind !== 'totp' && kind !== 'hotp') error('kind', 'Type must be totp or hotp.');

  for (const field of ['issuer', 'account'] as const) {
    const value = val(values, field);
    if (!value) error(field, `${field === 'issuer' ? 'Issuer' : 'Account'} is required.`);
    // The label is `issuer:account`; a colon in either half makes the split
    // ambiguous, and apps disagree on how to read it.
    else if (value.includes(':')) error(field, 'Must not contain a colon.');
  }

  const secret = normalizeOtpSecret(val(values, 'secret'));
  if (!secret) {
    error('secret', 'Secret is required.');
  } else if (!BASE32.test(secret)) {
    error('secret', 'Secret must be Base32: letters A–Z and digits 2–7.');
  } else if ([1, 3, 6].includes(secret.length % 8)) {
    // No whole number of bytes encodes to this many characters, so a
    // character was dropped or added while copying it.
    error('secret', 'Secret has an impossible Base32 length; check it was copied in full.');
  } else {
    const bytes = Math.floor((secret.length * 5) / 8);
    if (bytes < 16) {
      problems.push({
        field: 'secret',
        level: 'warning',
        message: `Secret is ${bytes} bytes; RFC 4226 asks for at least 16 (20 recommended).`,
      });
    } else if (bytes < 20) {
      problems.push({
        field: 'secret',
        level: 'warning',
        message: `Secret is ${bytes} bytes; 20 are recommended.`,
      });
    }
  }

  const algorithm = val(values, 'algorithm').toUpperCase();
  if (algorithm && !ALGORITHMS.includes(algorithm)) {
    error('algorithm', 'Algorithm must be SHA1, SHA256 or SHA512.');
  }
  const digits = val(values, 'digits');
  if (digits && !DIGITS.includes(digits)) error('digits', 'Digits must be 6 or 8.');

  if (kind === 'totp') {
    const period = val(values, 'period');
    if (period && !(INTEGER.test(period) && Number(period) >= 15 && Number(period) <= 300)) {
      error('period', 'Period must be a whole number of seconds from 15 to 300.');
    }
  } else if (kind === 'hotp') {
    const counter = val(values, 'counter');
    if (!counter) error('counter', 'Counter is required for HOTP.');
    else if (!(INTEGER.test(counter) && Number.isSafeInteger(Number(counter)))) {
      error('counter', 'Counter must be a whole number, 0 or more.');
    }
  }

  return problems;
};

/** Build the Key URI, omitting every parameter that equals its default. */
const serializeOtpauth = (values: PayloadValues): string => {
  const failure = validateOtpauth(values).find((p) => p.level === 'error');
  if (failure) throw new TypeError(`Cannot build an otpauth payload: ${failure.message}`);

  const kind = (val(values, 'kind') || OTPAUTH_DEFAULTS.kind).toLowerCase();
  const issuer = encodeURIComponent(val(values, 'issuer'));
  const label = `${issuer}:${encodeURIComponent(val(values, 'account'))}`;
  // The issuer is repeated as a parameter: the label prefix alone is ignored
  // by some apps, and the parameter alone by older ones.
  const params = [`secret=${normalizeOtpSecret(val(values, 'secret'))}`, `issuer=${issuer}`];

  const algorithm = val(values, 'algorithm').toUpperCase();
  if (algorithm && algorithm !== OTPAUTH_DEFAULTS.algorithm) params.push(`algorithm=${algorithm}`);
  const digits = val(values, 'digits');
  if (digits && digits !== OTPAUTH_DEFAULTS.digits) params.push(`digits=${digits}`);
  if (kind === 'totp') {
    const period = val(values, 'period');
    if (period && Number(period) !== Number(OTPAUTH_DEFAULTS.period)) {
      params.push(`period=${Number(period)}`);
    }
  } else {
    params.push(`counter=${Number(val(values, 'counter'))}`);
  }

  return `otpauth://${kind}/${label}?${params.join('&')}`;
};

export const SECURITY_TYPES: PayloadType[] = [
  {
    id: 'otpauth',
    label: 'Authenticator (2FA)',
    group: 'security',
    blurb: 'Adds an account to an authenticator app.',
    fields: [
      {
        name: 'kind',
        label: 'Type',
        type: 'select',
        half: true,
        options: [
          { value: 'totp', label: 'Time-based (TOTP)' },
          { value: 'hotp', label: 'Counter-based (HOTP)' },
        ],
      },
      { name: 'issuer', label: 'Issuer', type: 'text', required: true, half: true },
      {
        name: 'account',
        label: 'Account',
        type: 'text',
        required: true,
        placeholder: EXAMPLE_ACCOUNT,
      },
      {
        name: 'secret',
        label: 'Secret key',
        type: 'text',
        required: true,
        sensitive: true,
        help: 'Base32, as the service shows it. Spaces are ignored.',
      },
      {
        name: 'algorithm',
        label: 'Algorithm',
        type: 'select',
        half: true,
        options: ALGORITHMS.map((a) => ({ value: a, label: a })),
      },
      {
        name: 'digits',
        label: 'Digits',
        type: 'select',
        half: true,
        options: DIGITS.map((d) => ({ value: d, label: d })),
      },
      {
        name: 'period',
        label: 'Period (seconds)',
        type: 'number',
        half: true,
        placeholder: '30',
        help: 'TOTP only.',
      },
      { name: 'counter', label: 'Counter', type: 'number', half: true, help: 'HOTP only.' },
    ],
    serialize: serializeOtpauth,
    sample: {
      kind: 'totp',
      issuer: 'Example',
      account: EXAMPLE_ACCOUNT,
      secret: EXAMPLE_OTP_SECRET,
    },
    minEcc: 'M',
  },
];
