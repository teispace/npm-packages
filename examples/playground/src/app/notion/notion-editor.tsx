'use client';

import { $isParagraphNode } from 'lexical';
import { defaultBlockPlaceholder } from '@teispace/teieditor/extensions/placeholder';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { Editor } from '@teispace/teieditor/react';

// A hint in each empty paragraph, the kit's own labels for the other blocks.
const extensions = StarterKit.configure({
  placeholder: {
    block: (node, editor) =>
      $isParagraphNode(node) ? "Type '/' for commands" : defaultBlockPlaceholder(node, editor),
  },
});

export function NotionEditor() {
  return (
    <Editor
      preset="notion"
      bordered={false}
      extensions={extensions}
      content="<h1>Untitled</h1><p></p>"
      contentProps={{ 'aria-label': 'Page' }}
    />
  );
}
