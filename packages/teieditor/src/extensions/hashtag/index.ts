import { configExtension } from '@lexical/extension';
import { $isHashtagNode, HashtagExtension, HashtagNode } from '@lexical/hashtag';
import { DOMRenderExtension, domOverride } from '@lexical/html';
import { $getDocument, $getNearestNodeFromDOMNode } from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { hashtag as hashtagIcon } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';

export { $createHashtagNode, $isHashtagNode, HashtagNode } from '@lexical/hashtag';

export interface HashtagOptions {
  /** Called with the tag, without its `#`, when one in the document is clicked. */
  onClick: ((tag: string, event: MouseEvent) => void) | null;
}

export const HASHTAG_EXTENSION = '@teispace/teieditor/hashtag';

/**
 * Hashtags: `#launch` becomes a chip as you type it (Lexical's own
 * matcher, which knows non-Latin scripts). Saved as `<span
 * data-tei-hashtag>#launch</span>`; markdown keeps it as text, and it
 * turns back into a chip when read.
 */
export const Hashtag = defineTeiExtension({
  name: HASHTAG_EXTENSION,
  config: { onClick: null } as HashtagOptions,
  dependencies: [
    RichText,
    HashtagExtension,
    configExtension(DOMRenderExtension, {
      overrides: [
        domOverride([HashtagNode], {
          $createDOM: (_node, $next) => {
            const dom = $next();
            dom.setAttribute('data-tei-hashtag', '');
            return dom;
          },
          $exportDOM: (node) => {
            const element = $getDocument().createElement('span');
            element.setAttribute('data-tei-hashtag', '');
            element.textContent = node.getTextContent();
            return { element };
          },
        }),
      ],
    }),
  ],
  icons: { hashtag: hashtagIcon },
  register: ({ lexical, options, signal: aborted }) => {
    const onClick = (event: MouseEvent) => {
      const handler = options.onClick;
      if (!handler || event.button !== 0) return;
      const tag = lexical.read(() => {
        const node = $getNearestNodeFromDOMNode(event.target as Node);
        return $isHashtagNode(node) ? node.getTextContent().replace(/^[#＃]/, '') : null;
      });
      if (tag) handler(tag, event);
    };
    return lexical.registerRootListener((root, previous) => {
      previous?.removeEventListener('click', onClick);
      root?.addEventListener('click', onClick, { signal: aborted });
    });
  },
});
