import type { LexicalEditor } from 'lexical';
import type { ComponentType } from 'react';

export interface SlashCommandItem {
  /** Unique key. */
  name: string;
  /** Display label. */
  label: string;
  /** Description shown under the label. */
  description?: string;
  /** Icon component. */
  icon?: ComponentType<{ className?: string }>;
  /** Keywords for fuzzy search (besides label). */
  keywords?: string[];
  /** Group this command belongs to. */
  group?: string;
  /** Execute when selected. Receives the editor instance. */
  onSelect: (editor: LexicalEditor) => void;
}
