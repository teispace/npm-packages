import { TabIndentationPlugin as LexicalTabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import type { JSX } from 'react';

/**
 * Enables Tab key for content indentation and Shift+Tab for outdentation.
 * Wraps Lexical's built-in plugin.
 */
export function TabIndentationPlugin(): JSX.Element {
  return <LexicalTabIndentationPlugin />;
}
