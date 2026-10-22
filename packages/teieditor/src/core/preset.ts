import type { TeiExtensionInput } from './create.js';

/**
 * A ready set of extensions, plus which parts of `<Editor>`'s UI come with
 * it. Each preset is its own entry (`@teispace/teieditor/presets/full`), so
 * an app pays only for the one it imports. Headless too:
 *
 * ```ts
 * createTeiEditor({ extensions: full.extensions });
 * renderToHTML(json, { extensions: full.extensions });
 * ```
 *
 * Make your own by spreading one: `{ ...notion, extensions: [...notion.extensions, Mine] }`.
 */
export interface TeiPreset {
  /** On the frame as `data-tei-preset`, for styling. */
  readonly name: string;
  readonly extensions: readonly TeiExtensionInput[];
  /**
   * Parts of `<Editor>`'s UI by slot name (`toolbar`, `bubbleMenu`, …):
   * `false` leaves one out. Parts not named show when their extension is
   * installed; `<Editor slots>` overrides either way.
   */
  readonly ui?: Readonly<Record<string, boolean>>;
}
