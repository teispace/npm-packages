'use client';

import { $isParagraphNode } from 'lexical';
import { defaultBlockPlaceholder } from '@teispace/teieditor/extensions/placeholder';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { notion } from '@teispace/teieditor/presets/notion';
import { Editor } from '@teispace/teieditor/react';

// A hint in each empty paragraph, the kit's own labels for the other blocks.
const kit = StarterKit.configure({
  placeholder: {
    block: (node, editor) =>
      $isParagraphNode(node) ? "Type '/' for commands" : defaultBlockPlaceholder(node, editor),
  },
});
// The preset's features, with the kit configured as above.
const extensions = notion.extensions.map((extension) => (extension === StarterKit ? kit : extension));

export function NotionEditor() {
  return (
    <Editor
      preset={notion}
      bordered={false}
      extensions={extensions}
      content="<h1>Untitled</h1><p></p>"
      contentProps={{ 'aria-label': 'Page' }}
    />
  );
}
