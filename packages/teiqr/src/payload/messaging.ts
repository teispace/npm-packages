import { encodeParam, normalizePhone, query } from './escape.js';
import { EXAMPLE_EMAIL, EXAMPLE_PHONE } from './samples.js';
import type { PayloadType } from './types.js';
import { val } from './types.js';

export const MESSAGING_TYPES: PayloadType[] = [
  {
    id: 'email',
    label: 'Email',
    group: 'messaging',
    blurb: 'Opens a new email, prefilled.',
    fields: [
      { name: 'to', label: 'To', type: 'email', required: true },
      { name: 'subject', label: 'Subject', type: 'text' },
      { name: 'body', label: 'Message', type: 'textarea' },
      { name: 'cc', label: 'Cc', type: 'email', half: true },
      { name: 'bcc', label: 'Bcc', type: 'email', half: true },
    ],
    serialize: (v) =>
      `mailto:${encodeParam(val(v, 'to'))}${query({
        subject: val(v, 'subject') || undefined,
        body: val(v, 'body') || undefined,
        cc: val(v, 'cc') || undefined,
        bcc: val(v, 'bcc') || undefined,
      })}`,
    sample: { to: EXAMPLE_EMAIL, subject: 'Hello' },
  },
  {
    id: 'sms',
    label: 'SMS',
    group: 'messaging',
    blurb: 'Opens the messaging app with the number and text ready.',
    fields: [
      { name: 'phone', label: 'Phone number', type: 'tel', required: true },
      { name: 'message', label: 'Message', type: 'textarea' },
    ],
    // SMSTO: is the widely supported form; `sms:` body handling is inconsistent
    // between iOS and Android.
    serialize: (v) => {
      const phone = normalizePhone(val(v, 'phone'));
      const message = val(v, 'message');
      return message ? `SMSTO:${phone}:${message}` : `SMSTO:${phone}`;
    },
    sample: { phone: EXAMPLE_PHONE, message: 'Hi!' },
  },
  {
    id: 'phone',
    label: 'Phone call',
    group: 'messaging',
    blurb: 'Starts a call to the number.',
    fields: [{ name: 'phone', label: 'Phone number', type: 'tel', required: true }],
    serialize: (v) => `tel:${normalizePhone(val(v, 'phone'))}`,
    sample: { phone: EXAMPLE_PHONE },
  },
  {
    id: 'facetime',
    label: 'FaceTime',
    group: 'messaging',
    blurb: 'Starts a FaceTime call. iOS and macOS only.',
    fields: [
      { name: 'target', label: 'Phone or Apple ID', type: 'text', required: true },
      {
        name: 'audioOnly',
        label: 'Audio only',
        type: 'select',
        half: true,
        options: [
          { value: 'false', label: 'No — video call' },
          { value: 'true', label: 'Yes — audio only' },
        ],
      },
    ],
    serialize: (v) => {
      const scheme = val(v, 'audioOnly') === 'true' ? 'facetime-audio' : 'facetime';
      const target = val(v, 'target');
      return `${scheme}:${target.includes('@') ? target : normalizePhone(target)}`;
    },
    sample: { target: EXAMPLE_PHONE, audioOnly: 'false' },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    group: 'messaging',
    blurb: 'Opens a WhatsApp chat, message prefilled.',
    fields: [
      {
        name: 'phone',
        label: 'Phone number',
        type: 'tel',
        required: true,
        help: 'Include the country code. WhatsApp rejects numbers without one.',
      },
      { name: 'message', label: 'Message', type: 'textarea' },
    ],
    serialize: (v) =>
      // wa.me wants the number without a leading +.
      `https://wa.me/${normalizePhone(val(v, 'phone')).replace(/^\+/, '')}${query({
        text: val(v, 'message') || undefined,
      })}`,
    sample: { phone: EXAMPLE_PHONE, message: 'Hi!' },
  },
  {
    id: 'telegram',
    label: 'Telegram',
    group: 'messaging',
    blurb: 'Opens a Telegram profile or channel.',
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true, placeholder: '@handle' },
    ],
    serialize: (v) => `https://t.me/${val(v, 'username').replace(/^@/, '')}`,
    sample: { username: '@telegram' },
  },
];
