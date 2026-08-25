import { escapeMeCard, escapeVCard, normalizePhone, normalizeUrl, vcardLines } from './escape.js';
import {
  EXAMPLE_CITY,
  EXAMPLE_COUNTRY,
  EXAMPLE_EMAIL,
  EXAMPLE_NAME,
  EXAMPLE_ORG,
  EXAMPLE_PHONE,
  EXAMPLE_SITE,
  EXAMPLE_TITLE,
} from './samples.js';
import type { PayloadType, PayloadValues } from './types.js';
import { val } from './types.js';

const CONTACT_FIELDS = [
  { name: 'firstName', label: 'First name', type: 'text' as const, half: true, required: true },
  { name: 'lastName', label: 'Last name', type: 'text' as const, half: true },
  { name: 'org', label: 'Organisation', type: 'text' as const, half: true },
  { name: 'title', label: 'Job title', type: 'text' as const, half: true },
  { name: 'mobile', label: 'Mobile', type: 'tel' as const, half: true },
  { name: 'phone', label: 'Work phone', type: 'tel' as const, half: true },
  { name: 'email', label: 'Email', type: 'email' as const },
  { name: 'url', label: 'Website', type: 'url' as const },
  { name: 'street', label: 'Street', type: 'text' as const },
  { name: 'city', label: 'City', type: 'text' as const, half: true },
  { name: 'region', label: 'Region', type: 'text' as const, half: true },
  { name: 'postcode', label: 'Postcode', type: 'text' as const, half: true },
  { name: 'country', label: 'Country', type: 'text' as const, half: true },
  { name: 'note', label: 'Note', type: 'textarea' as const },
];

const SAMPLE: PayloadValues = {
  firstName: EXAMPLE_NAME.first,
  lastName: EXAMPLE_NAME.last,
  org: EXAMPLE_ORG,
  title: EXAMPLE_TITLE,
  mobile: EXAMPLE_PHONE,
  email: EXAMPLE_EMAIL,
  url: EXAMPLE_SITE,
  city: EXAMPLE_CITY,
  country: EXAMPLE_COUNTRY,
};

const fullName = (v: PayloadValues): string =>
  [val(v, 'firstName'), val(v, 'lastName')].filter(Boolean).join(' ');

const address = (v: PayloadValues): string[] => [
  val(v, 'street'),
  val(v, 'city'),
  val(v, 'region'),
  val(v, 'postcode'),
  val(v, 'country'),
];

const hasAddress = (v: PayloadValues): boolean => address(v).some(Boolean);

const buildVCard = (v: PayloadValues, version: '3.0' | '4.0'): string => {
  const e = escapeVCard;
  const [street, city, region, postcode, country] = address(v);
  // vCard 4.0 puts a scheme on phone numbers; 3.0 carries them bare.
  const tel = (value: string) => (version === '4.0' ? `tel:${normalizePhone(value)}` : value);

  return vcardLines([
    'BEGIN:VCARD',
    `VERSION:${version}`,
    `N:${e(val(v, 'lastName'))};${e(val(v, 'firstName'))};;;`,
    `FN:${e(fullName(v))}`,
    val(v, 'org') ? `ORG:${e(val(v, 'org'))}` : null,
    val(v, 'title') ? `TITLE:${e(val(v, 'title'))}` : null,
    val(v, 'mobile') ? `TEL;TYPE=CELL:${e(tel(val(v, 'mobile')))}` : null,
    val(v, 'phone') ? `TEL;TYPE=WORK:${e(tel(val(v, 'phone')))}` : null,
    val(v, 'email') ? `EMAIL:${e(val(v, 'email'))}` : null,
    val(v, 'url') ? `URL:${e(normalizeUrl(val(v, 'url')))}` : null,
    hasAddress(v)
      ? `ADR;TYPE=WORK:;;${e(street)};${e(city)};${e(region)};${e(postcode)};${e(country)}`
      : null,
    val(v, 'note') ? `NOTE:${e(val(v, 'note'))}` : null,
    'END:VCARD',
  ]);
};

export const CONTACT_TYPES: PayloadType[] = [
  {
    id: 'vcard',
    label: 'Contact card',
    group: 'contact',
    blurb: 'Saves a contact to the phone.',
    fields: CONTACT_FIELDS,
    serialize: (v) => buildVCard(v, '3.0'),
    sample: SAMPLE,
    minEcc: 'M',
  },
  {
    id: 'vcard4',
    label: 'Contact card (vCard 4.0)',
    group: 'contact',
    blurb: 'Newer vCard revision. Use 3.0 unless you know the reader wants 4.0.',
    fields: CONTACT_FIELDS,
    serialize: (v) => buildVCard(v, '4.0'),
    sample: SAMPLE,
    minEcc: 'M',
  },
  {
    id: 'mecard',
    label: 'Contact card (MeCard)',
    group: 'contact',
    blurb: 'Compact contact format. Smaller code, fewer fields.',
    fields: CONTACT_FIELDS.filter((f) => !['region', 'postcode', 'title'].includes(f.name)),
    serialize: (v) => {
      const e = escapeMeCard;
      const parts = [
        `N:${e(val(v, 'lastName'))},${e(val(v, 'firstName'))}`,
        val(v, 'mobile') ? `TEL:${e(normalizePhone(val(v, 'mobile')))}` : '',
        val(v, 'phone') ? `TEL:${e(normalizePhone(val(v, 'phone')))}` : '',
        val(v, 'email') ? `EMAIL:${e(val(v, 'email'))}` : '',
        val(v, 'url') ? `URL:${e(normalizeUrl(val(v, 'url')))}` : '',
        val(v, 'org') ? `ORG:${e(val(v, 'org'))}` : '',
        hasAddress(v)
          ? `ADR:${[val(v, 'street'), val(v, 'city'), val(v, 'country')].map(e).join(',')}`
          : '',
        val(v, 'note') ? `NOTE:${e(val(v, 'note'))}` : '',
      ].filter(Boolean);
      return `MECARD:${parts.join(';')};;`;
    },
    sample: SAMPLE,
    minEcc: 'M',
  },
];
