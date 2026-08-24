import { normalizeUrl } from './escape.js';
import type { PayloadType } from './types.js';
import { val } from './types.js';

type Network = {
  id: string;
  label: string;
  base: string;
  placeholder: string;
};

const NETWORKS: Network[] = [
  { id: 'instagram', label: 'Instagram', base: 'https://instagram.com/', placeholder: 'handle' },
  { id: 'facebook', label: 'Facebook', base: 'https://facebook.com/', placeholder: 'page' },
  { id: 'x', label: 'X / Twitter', base: 'https://x.com/', placeholder: 'handle' },
  { id: 'linkedin', label: 'LinkedIn', base: 'https://linkedin.com/in/', placeholder: 'profile' },
  { id: 'tiktok', label: 'TikTok', base: 'https://tiktok.com/@', placeholder: 'handle' },
  { id: 'github', label: 'GitHub', base: 'https://github.com/', placeholder: 'username' },
];

const profileType = ({ id, label, base, placeholder }: Network): PayloadType => ({
  id,
  label,
  group: 'social',
  blurb: `Opens a ${label} profile.`,
  fields: [
    {
      name: 'handle',
      label: 'Username or full URL',
      type: 'text',
      required: true,
      placeholder,
    },
  ],
  serialize: (v) => {
    const handle = val(v, 'handle').replace(/^@/, '');
    if (!handle) return '';
    // Accept a pasted full URL as readily as a bare handle.
    if (/^(https?:)?\/\//i.test(handle) || handle.includes('.')) return normalizeUrl(handle);
    return `${base}${handle}`;
  },
  sample: { handle: placeholder },
});

export const SOCIAL_TYPES: PayloadType[] = NETWORKS.map(profileType);
