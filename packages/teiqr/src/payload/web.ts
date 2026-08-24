import { normalizeUrl, query } from './escape.js';
import type { PayloadType } from './types.js';
import { val } from './types.js';

export const WEB_TYPES: PayloadType[] = [
  {
    id: 'url',
    label: 'Website',
    group: 'web',
    blurb: 'Opens a link.',
    fields: [
      {
        name: 'url',
        label: 'URL',
        type: 'url',
        placeholder: 'krishna-adhikari.com.np',
        required: true,
        help: 'https:// is added automatically if you leave it off.',
      },
    ],
    serialize: (v) => normalizeUrl(val(v, 'url')),
    sample: { url: 'https://krishna-adhikari.com.np' },
  },
  {
    id: 'youtube',
    label: 'YouTube',
    group: 'web',
    blurb: 'Opens a video or channel.',
    fields: [{ name: 'url', label: 'Video or channel URL', type: 'url', required: true }],
    serialize: (v) => normalizeUrl(val(v, 'url')),
    sample: { url: 'https://youtube.com/@TheKAdhikari' },
  },
  {
    id: 'spotify',
    label: 'Spotify',
    group: 'web',
    blurb: 'Opens a track, album, or artist.',
    fields: [{ name: 'url', label: 'Spotify link', type: 'url', required: true }],
    serialize: (v) => normalizeUrl(val(v, 'url')),
    sample: { url: 'https://open.spotify.com/artist/4L89xDaZXexzO5xphuf4pP' },
  },
  {
    id: 'app',
    label: 'App download',
    group: 'web',
    blurb: 'Sends iOS to the App Store and Android to Play, from one code.',
    fields: [
      { name: 'ios', label: 'App Store URL', type: 'url' },
      { name: 'android', label: 'Google Play URL', type: 'url' },
      {
        name: 'fallback',
        label: 'Fallback URL',
        type: 'url',
        help: 'Used on desktop and anything that is neither. A landing page works well.',
      },
    ],
    // A static QR cannot branch on the scanning device — only a server can.
    // Encoding the fallback keeps the promise honest rather than shipping a
    // code that silently sends half of all scanners to the wrong store.
    serialize: (v) => normalizeUrl(val(v, 'fallback') || val(v, 'ios') || val(v, 'android')),
    sample: { fallback: 'https://example.com/app' },
  },
  {
    id: 'pdf',
    label: 'File or PDF',
    group: 'web',
    blurb: 'Opens a hosted file.',
    fields: [
      {
        name: 'url',
        label: 'File URL',
        type: 'url',
        required: true,
        help: 'The file has to be hosted somewhere — a QR code holds a link, not the file itself.',
      },
    ],
    serialize: (v) => normalizeUrl(val(v, 'url')),
    sample: { url: 'https://example.com/menu.pdf' },
  },
  {
    id: 'googleform',
    label: 'Form or survey',
    group: 'web',
    blurb: 'Opens a form with optional prefilled answers.',
    fields: [
      { name: 'url', label: 'Form URL', type: 'url', required: true },
      {
        name: 'prefill',
        label: 'Prefill query',
        type: 'text',
        placeholder: 'entry.123=Kathmandu',
        help: 'Appended as a query string. Leave blank for none.',
      },
    ],
    serialize: (v) => {
      const base = normalizeUrl(val(v, 'url'));
      const prefill = val(v, 'prefill');
      if (!prefill) return base;
      return base.includes('?') ? `${base}&${prefill}` : `${base}?${prefill}`;
    },
    sample: { url: 'https://forms.gle/example' },
  },
  {
    id: 'review',
    label: 'Review link',
    group: 'web',
    blurb: 'Opens a review page with the rating dialog ready.',
    fields: [
      {
        name: 'placeId',
        label: 'Google Place ID',
        type: 'text',
        required: true,
        help: 'From the Google Place ID finder.',
      },
    ],
    serialize: (v) =>
      `https://search.google.com/local/writereview${query({ placeid: val(v, 'placeId') })}`,
    sample: { placeId: 'ChIJdwallcgQ6zkRVjBAOOEUnHU' },
  },
];
