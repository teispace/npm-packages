import type { InputHTMLAttributes } from 'react';
import type { FieldType, PayloadField } from '../payload/types.js';

/** HTML input types for the field types that render as an `<input>`. */
const INPUT_TYPE: Partial<Record<FieldType, string>> = {
  text: 'text',
  url: 'url',
  email: 'email',
  tel: 'tel',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'datetime-local',
};

export interface PayloadFieldPropsOptions {
  /**
   * Show a sensitive value in clear, for a "show password" toggle. The input
   * keeps autocomplete and spellcheck off either way.
   */
  reveal?: boolean;
}

/**
 * Props for the `<input>` (or `<textarea>`/`<select>`) that edits one payload
 * field, so a form driven by `type.fields` gets credentials right without
 * special-casing them.
 *
 * Sensitive fields — a WiFi password, an authenticator secret — render as
 * `type="password"` with autocomplete, autocapitalise and spellcheck off: the
 * browser should neither offer to save the value nor send it to a spelling
 * service.
 *
 * @example
 * const [reveal, setReveal] = useState(false);
 * <input {...payloadFieldProps(field, { reveal })} value={values[field.name] ?? ''} onChange={…} />
 */
export const payloadFieldProps = (
  field: PayloadField,
  options: PayloadFieldPropsOptions = {},
): InputHTMLAttributes<HTMLInputElement> => {
  const props: InputHTMLAttributes<HTMLInputElement> = {
    name: field.name,
    ...(field.required ? { required: true } : {}),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
  };
  const type = INPUT_TYPE[field.type];
  if (type) props.type = type;
  if (field.type === 'number') props.inputMode = 'numeric';

  if (field.sensitive) {
    props.type = options.reveal ? 'text' : 'password';
    props.autoComplete = 'off';
    props.autoCapitalize = 'off';
    props.autoCorrect = 'off';
    props.spellCheck = false;
  }
  return props;
};
