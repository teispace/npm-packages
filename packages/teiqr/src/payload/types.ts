export type PayloadGroup =
  | 'web'
  | 'contact'
  | 'network'
  | 'messaging'
  | 'place'
  | 'payment'
  | 'social'
  | 'plain';

export type FieldType =
  | 'text'
  | 'url'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'date'
  | 'datetime';

export type PayloadField = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Short hint rendered under the input. */
  help?: string;
  /** Lay two fields side by side on wide screens. */
  half?: boolean;
};

export type PayloadValues = Record<string, string | undefined>;

export type PayloadType = {
  id: string;
  label: string;
  group: PayloadGroup;
  /** One line describing what scanning it does. */
  blurb: string;
  fields: PayloadField[];
  /** Field values → the exact string that gets encoded. */
  serialize: (values: PayloadValues) => string;
  /**
   * Starting values, so the preview shows a real code the moment the type is
   * picked rather than an empty frame.
   */
  sample: PayloadValues;
  /**
   * Levels below this are refused for this type. Payment and WiFi codes get
   * scanned once, often from a printed surface, and a misread is expensive.
   */
  minEcc?: 'L' | 'M' | 'Q' | 'H';
};

export const GROUP_LABEL: Record<PayloadGroup, string> = {
  web: 'Web & app',
  contact: 'Contact',
  network: 'Network',
  messaging: 'Messaging',
  place: 'Time & place',
  payment: 'Payments',
  social: 'Social',
  plain: 'Plain',
};

export const val = (values: PayloadValues, key: string): string => (values[key] ?? '').trim();
