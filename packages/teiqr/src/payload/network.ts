import { escapeWifi } from './escape.js';
import type { PayloadType } from './types.js';
import { val } from './types.js';

export const NETWORK_TYPES: PayloadType[] = [
  {
    id: 'wifi',
    label: 'WiFi network',
    group: 'network',
    blurb: 'Joins a network without typing the password.',
    fields: [
      { name: 'ssid', label: 'Network name (SSID)', type: 'text', required: true },
      {
        name: 'encryption',
        label: 'Security',
        type: 'select',
        half: true,
        options: [
          { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
          { value: 'WEP', label: 'WEP (legacy)' },
          { value: 'nopass', label: 'Open — no password' },
          { value: 'WPA2-EAP', label: 'WPA2 Enterprise (EAP)' },
        ],
      },
      { name: 'password', label: 'Password', type: 'text', half: true },
      {
        name: 'hidden',
        label: 'Hidden network',
        type: 'select',
        half: true,
        options: [
          { value: 'false', label: 'No' },
          { value: 'true', label: 'Yes' },
        ],
      },
      {
        name: 'identity',
        label: 'Identity (EAP only)',
        type: 'text',
        half: true,
      },
      { name: 'eapMethod', label: 'EAP method', type: 'text', half: true, placeholder: 'PEAP' },
      {
        name: 'phase2',
        label: 'Phase 2 (EAP only)',
        type: 'text',
        half: true,
        placeholder: 'MSCHAPV2',
      },
    ],
    serialize: (v) => {
      const encryption = val(v, 'encryption') || 'WPA';
      const parts = [`T:${encryption}`, `S:${escapeWifi(val(v, 'ssid'))}`];

      if (encryption !== 'nopass' && val(v, 'password')) {
        parts.push(`P:${escapeWifi(val(v, 'password'))}`);
      }
      if (encryption === 'WPA2-EAP') {
        if (val(v, 'eapMethod')) parts.push(`E:${escapeWifi(val(v, 'eapMethod'))}`);
        if (val(v, 'identity')) parts.push(`I:${escapeWifi(val(v, 'identity'))}`);
        if (val(v, 'phase2')) parts.push(`PH2:${escapeWifi(val(v, 'phase2'))}`);
      }
      // Android only treats the network as hidden when H is explicitly true;
      // emitting H:false is harmless and clearer than omitting it.
      if (val(v, 'hidden') === 'true') parts.push('H:true');

      return `WIFI:${parts.join(';')};;`;
    },
    sample: { ssid: 'Pokhara Cafe', encryption: 'WPA', password: 'himalaya2026', hidden: 'false' },
    minEcc: 'Q',
  },
];
