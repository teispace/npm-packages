import { $isCodeNode } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isHeadingNode } from '@lexical/rich-text';
import { $getRoot, $isParagraphNode } from 'lexical';
import { useEffect } from 'react';

export interface PlaceholderPluginProps {
  placeholders: Record<string, string>;
}

/**
 * Adds CSS-based per-block-type placeholder text via data attributes.
 * Works by setting `data-placeholder` on empty block elements and
 * injecting a minimal CSS rule for `[data-placeholder]:empty::before`.
 */
export function PlaceholderPlugin({ placeholders }: PlaceholderPluginProps): null {
  const [editor] = useLexicalComposerContext();

  // Inject the CSS rule once
  useEffect(() => {
    const styleId = 'tei-placeholder-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-tei-placeholder]:empty::before {
        content: attr(data-tei-placeholder);
        color: var(--tei-placeholder-color, hsl(var(--muted-foreground) / 0.4));
        pointer-events: none;
        position: absolute;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  // Update placeholders on content changes
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        for (const child of children) {
          const domElem = editor.getElementByKey(child.getKey());
          if (!domElem) continue;

          const isEmpty = child.getTextContent().trim() === '';
          if (!isEmpty) {
            domElem.removeAttribute('data-tei-placeholder');
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

          const text = placeholders[placeholderKey] || '';
          if (text) {
            domElem.setAttribute('data-tei-placeholder', text);
          } else {
            domElem.removeAttribute('data-tei-placeholder');
          }
        }
      });
    });
  }, [editor, placeholders]);

  return null;
}
