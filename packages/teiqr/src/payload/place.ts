import { escapeVCard, query, toICalDate, vcardLines } from './escape.js';
import type { PayloadType } from './types.js';
import { val } from './types.js';

export const PLACE_TYPES: PayloadType[] = [
  {
    id: 'geo',
    label: 'Location',
    group: 'place',
    blurb: 'Opens coordinates in the default maps app.',
    fields: [
      { name: 'lat', label: 'Latitude', type: 'text', half: true, required: true },
      { name: 'lng', label: 'Longitude', type: 'text', half: true, required: true },
      { name: 'label', label: 'Place name', type: 'text' },
    ],
    serialize: (v) => {
      const base = `geo:${val(v, 'lat')},${val(v, 'lng')}`;
      const label = val(v, 'label');
      return label ? `${base}${query({ q: `${val(v, 'lat')},${val(v, 'lng')}(${label})` })}` : base;
    },
    sample: { lat: '28.2096', lng: '83.9856', label: 'Pokhara' },
  },
  {
    id: 'maps',
    label: 'Map link',
    group: 'place',
    blurb: 'Opens a search or place in Google Maps.',
    fields: [
      {
        name: 'q',
        label: 'Place or address',
        type: 'text',
        required: true,
        placeholder: 'Phewa Lake, Pokhara',
      },
    ],
    serialize: (v) =>
      `https://www.google.com/maps/search/${query({ api: '1', query: val(v, 'q') })}`,
    sample: { q: 'Phewa Lake, Pokhara' },
  },
  {
    id: 'event',
    label: 'Calendar event',
    group: 'place',
    blurb: 'Adds an event to the calendar.',
    fields: [
      { name: 'summary', label: 'Event name', type: 'text', required: true },
      { name: 'start', label: 'Starts', type: 'datetime', half: true, required: true },
      { name: 'end', label: 'Ends', type: 'datetime', half: true },
      {
        name: 'allDay',
        label: 'All day',
        type: 'select',
        half: true,
        options: [
          { value: 'false', label: 'No' },
          { value: 'true', label: 'Yes' },
        ],
      },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    serialize: (v) => {
      const allDay = val(v, 'allDay') === 'true';
      const e = escapeVCard;
      const prefix = allDay ? ';VALUE=DATE' : '';
      return vcardLines([
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        `SUMMARY:${e(val(v, 'summary'))}`,
        `DTSTART${prefix}:${toICalDate(val(v, 'start'), allDay)}`,
        val(v, 'end') ? `DTEND${prefix}:${toICalDate(val(v, 'end'), allDay)}` : null,
        val(v, 'location') ? `LOCATION:${e(val(v, 'location'))}` : null,
        val(v, 'description') ? `DESCRIPTION:${e(val(v, 'description'))}` : null,
        'END:VEVENT',
        'END:VCALENDAR',
      ]);
    },
    sample: {
      summary: 'Album launch',
      start: '2026-09-12T18:00',
      end: '2026-09-12T21:00',
      location: 'Pokhara',
      allDay: 'false',
    },
    minEcc: 'M',
  },
];
