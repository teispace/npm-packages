import { ClickableLinkPlugin as LexicalClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import type { JSX } from 'react';

/**
 * Makes links in the editor clickable. Ctrl/Cmd+click opens in new tab.
 * Wraps Lexical's built-in plugin.
 */
export function ClickableLinkPlugin(): JSX.Element {
  return <LexicalClickableLinkPlugin newTab />;
}
