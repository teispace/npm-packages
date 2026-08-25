import { CONTACT_TYPES } from './contact.js';
import { MESSAGING_TYPES } from './messaging.js';
import { NETWORK_TYPES } from './network.js';
import { PAYMENT_TYPES } from './payment.js';
import { PLACE_TYPES } from './place.js';
import { SOCIAL_TYPES } from './social.js';
import type { PayloadGroup, PayloadType, PayloadValues } from './types.js';
import { val } from './types.js';
import { WEB_TYPES } from './web.js';

const PLAIN_TYPES: PayloadType[] = [
  {
    id: 'text',
    label: 'Plain text',
    group: 'plain',
    blurb: 'Shows text. No app opens, nothing is fetched.',
    fields: [{ name: 'text', label: 'Text', type: 'textarea', required: true }],
    serialize: (v) => val(v, 'text'),
    sample: { text: 'Made in Pokhara.' },
  },
];

export const PAYLOAD_TYPES: PayloadType[] = [
  ...WEB_TYPES,
  ...CONTACT_TYPES,
  ...NETWORK_TYPES,
  ...MESSAGING_TYPES,
  ...PLACE_TYPES,
  ...PAYMENT_TYPES,
  ...SOCIAL_TYPES,
  ...PLAIN_TYPES,
];

const BY_ID = new Map(PAYLOAD_TYPES.map((t) => [t.id, t]));

/**
 * Register a payload type of your own.
 *
 * Custom types behave exactly like the built-ins: `serializePayload` and
 * `isPayloadComplete` accept them, they appear in {@link PAYLOAD_GROUPS}, and
 * a form driven by `type.fields` renders them without special-casing. Pair it
 * with `registerPayloadParser` to read the format back as well.
 *
 * Registering an id that already exists replaces it, which is how you override
 * a built-in — to add a field, or to change how one serialises.
 *
 * @example
 * registerPayloadType({
 *   id: 'asset', label: 'Asset tag', group: 'plain',
 *   blurb: 'Opens the internal asset register.',
 *   fields: [{ name: 'id', label: 'Asset ID', type: 'text', required: true }],
 *   serialize: (v) => `ASSET:${val(v, 'id')}`,
 *   sample: { id: 'A-1024' },
 * });
 */
export const registerPayloadType = (type: PayloadType): void => {
  const existing = PAYLOAD_TYPES.findIndex((t) => t.id === type.id);
  if (existing === -1) PAYLOAD_TYPES.push(type);
  else PAYLOAD_TYPES[existing] = type;
  BY_ID.set(type.id, type);

  // Keep the grouped view in step, so a UI built on it picks the type up.
  const group = PAYLOAD_GROUPS.find((g) => g.group === type.group);
  if (group) {
    const at = group.types.findIndex((t) => t.id === type.id);
    if (at === -1) group.types.push(type);
    else group.types[at] = type;
  }
};

/** Remove a registered payload type by id. Returns whether one was removed. */
export const unregisterPayloadType = (id: string): boolean => {
  const index = PAYLOAD_TYPES.findIndex((t) => t.id === id);
  if (index === -1) return false;
  const [removed] = PAYLOAD_TYPES.splice(index, 1);
  BY_ID.delete(id);
  const group = PAYLOAD_GROUPS.find((g) => g.group === removed.group);
  if (group) {
    const at = group.types.findIndex((t) => t.id === id);
    if (at !== -1) group.types.splice(at, 1);
  }
  return true;
};

export const getPayloadType = (id: string): PayloadType | undefined => BY_ID.get(id);

export const PAYLOAD_GROUPS: { group: PayloadGroup; types: PayloadType[] }[] = (() => {
  const order: PayloadGroup[] = [
    'web',
    'contact',
    'network',
    'messaging',
    'place',
    'payment',
    'social',
    'plain',
  ];
  return order.map((group) => ({
    group,
    types: PAYLOAD_TYPES.filter((t) => t.group === group),
  }));
})();

/** Serialize by type id. Returns an empty string for an unknown id. */
export const serializePayload = (typeId: string, values: PayloadValues): string =>
  getPayloadType(typeId)?.serialize(values) ?? '';

/** True when every field marked required has a non-empty value. */
export const isPayloadComplete = (typeId: string, values: PayloadValues): boolean => {
  const type = getPayloadType(typeId);
  if (!type) return false;
  return type.fields.every((f) => !f.required || val(values, f.name).length > 0);
};

export type { PayloadField, PayloadGroup, PayloadType, PayloadValues } from './types.js';
export { GROUP_LABEL } from './types.js';
