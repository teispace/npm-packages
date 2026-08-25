import { normalizeUrl } from './escape.js';
import type { PayloadType } from './types.js';
import { val } from './types.js';

export interface SocialNetwork {
  readonly id: string;
  readonly label: string;
  /** The canonical URL prefix the serialiser writes, host and path both. */
  readonly base: string;
  readonly placeholder: string;
  /**
   * Every host this network answers on, not only the canonical one.
   *
   * People paste what their browser gave them, so a parser that recognises
   * only what the serialiser writes fails on the majority of real input:
   * `twitter.com` for X, `m.facebook.com` from a phone, `www.` on anything.
   */
  readonly hosts: readonly string[];
  /** Path segment before the handle, for networks that namespace profiles. */
  readonly prefix: string;
}

export const SOCIAL_NETWORKS: readonly SocialNetwork[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    base: 'https://instagram.com/',
    placeholder: 'handle',
    hosts: ['instagram.com'],
    prefix: '',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    base: 'https://facebook.com/',
    placeholder: 'page',
    hosts: ['facebook.com', 'fb.com', 'fb.me'],
    prefix: '',
  },
  {
    id: 'x',
    label: 'X / Twitter',
    base: 'https://x.com/',
    placeholder: 'handle',
    hosts: ['x.com', 'twitter.com'],
    prefix: '',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    base: 'https://linkedin.com/in/',
    placeholder: 'profile',
    hosts: ['linkedin.com'],
    prefix: 'in/',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    base: 'https://tiktok.com/@',
    placeholder: 'handle',
    hosts: ['tiktok.com'],
    prefix: '@',
  },
  {
    id: 'github',
    label: 'GitHub',
    base: 'https://github.com/',
    placeholder: 'username',
    hosts: ['github.com'],
    prefix: '',
  },
] as const;

const escapeHost = (host: string): string => host.replace(/\./g, '\\.');

/**
 * A pattern matching one network's profile URLs, and the group the handle
 * falls in.
 *
 * Built from the same table the serialiser uses, so a network cannot be
 * written in a form its own parser will not read back.
 */
export const profileUrlPattern = (network: SocialNetwork): RegExp =>
  new RegExp(
    `^https?://(?:www\\.|m\\.)?(?:${network.hosts.map(escapeHost).join('|')})/` +
      `${network.prefix.replace('@', '@?')}([^/?#\\s]+)/?(?:[?#].*)?$`,
    'i',
  );

const profileType = ({ id, label, base, placeholder }: SocialNetwork): PayloadType => ({
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

export const SOCIAL_TYPES: PayloadType[] = SOCIAL_NETWORKS.map(profileType);
