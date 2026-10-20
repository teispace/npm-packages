'use client';

import { $isCodeNode } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isHeadingNode } from '@lexical/rich-text';
import { $getRoot, $isParagraphNode } from 'lexical';
import { useEffect } from 'react';

export interface PlaceholderPluginProps {
  placeholders: Record<string, string>;
}

const ATTRIBUTE = 'data-tei-placeholder';

/**
 * Per-block placeholder text. Sets `data-tei-placeholder` on each empty top-level
 * block; the rule that shows it lives in `@teispace/teieditor/styles.css`.
 *
 * It used to inject that rule as a `<style>` element, which a strict
 * `style-src` blocks, which raced between editors on one page (the first to
 * unmount removed it for all), and whose selector never matched: an empty
 * Lexical block holds a `<br>`, so it is never `:empty`.
 */
export function PlaceholderPlugin({ placeholders }: PlaceholderPluginProps): null {
  const [editor] = useLexicalComposerContext();

  // Update placeholders on content changes
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        for (const child of children) {
          const domElem = editor.getElementByKey(child.getKey());
          if (!domElem) continue;

          if (child.getTextContent().trim() !== '') {
            setPlaceholder(domElem, '');
            continue;
          }

          let placeholderKey = 'paragraph';
          if ($isHeadingNode(child)) {
            placeholderKey = 'heading';
          } else if ($isCodeNode(child)) {
            placeholderKey = 'code';
          } else if (child.getType() === 'quote') {
            placeholderKey = 'quote';
          } else if ($isParagraphNode(child)) {
            // If this is the only child and it's empty, use root placeholder
            placeholderKey = children.length === 1 ? 'root' : 'paragraph';
          }

          setPlaceholder(domElem, placeholders[placeholderKey] || '');
        }
      });
    });
  }, [editor, placeholders]);

  return null;
}

/**
 * Set or clear the attribute, touching the DOM only when it changes. This runs
 * for every block on every update, so most calls are no-ops.
 */
function setPlaceholder(element: HTMLElement, text: string): void {
  if ((element.getAttribute(ATTRIBUTE) ?? '') === text) return;
  if (text) element.setAttribute(ATTRIBUTE, text);
  else element.removeAttribute(ATTRIBUTE);
}
