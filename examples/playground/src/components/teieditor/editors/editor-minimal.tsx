'use client';

import type { TeiEditorConfig, TeiExtension } from '@teispace/teieditor/core';
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import {
  Blockquote,
  Bold,
  Heading,
  Highlight,
  History,
  InlineCode,
  Italic,
  Link,
  List,
  Paragraph,
  Strikethrough,
  Underline,
} from '@teispace/teieditor/extensions';
import type { OutputFormat } from '@teispace/teieditor/plugins';
import {
  ClickableLinkPlugin,
  EditorContent,
  InitialValuePlugin,
  KeyboardShortcutsPlugin,
  OnChangePlugin,
} from '@teispace/teieditor/plugins';
import type { SerializationFormat } from '@teispace/teieditor/utils';
import { useEffect, useMemo, useState } from 'react';
import { BubbleMenu } from '../components/bubble-menu/bubble-menu';
import { LinkEditor } from '../components/link-editor/link-editor';

/** Minimal extension set for comments/inputs. */
const MinimalKit = [
  Paragraph,
  Heading.configure({ levels: ['h1', 'h2', 'h3'] }),
  Bold,
  Italic,
  Underline,
  Strikethrough,
  InlineCode,
  Highlight,
  Blockquote,
  Link,
  List,
  History,
];

export interface TeiEditorMinimalProps {
  extensions?: TeiExtension[];
  initialValue?: string;
  initialFormat?: SerializationFormat;
  onChange?: (value: string) => void;
  format?: OutputFormat;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  readOnly?: boolean;
  config?: Partial<TeiEditorConfig>;
}

/**
 * Minimal editor: bubble menu only, no toolbar, no slash commands.
 * Good for comments, chat inputs, small rich text fields.
 */
export function TeiEditorMinimal({
  extensions = [],
  initialValue,
  initialFormat = 'html',
  onChange,
  format = 'html',
  placeholder = 'Write a comment...',
  className = '',
  editorClassName = '',
  readOnly = false,
  config = {},
}: TeiEditorMinimalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const editor = useMemo(
    () =>
      createTeiEditor({
        extensions: [...MinimalKit, ...extensions],
        editable: !readOnly,
        ...config,
      }),
    [readOnly, extensions, config],
  );

  if (!mounted) {
    return (
      <div
        className={`tei-editor-wrapper rounded-[var(--tei-radius)] border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] animate-pulse ${className}`.trim()}
      >
        <div className="min-h-[80px] p-3">
          <div className="h-3 w-32 rounded bg-[hsl(var(--tei-muted))]" />
        </div>
      </div>
    );
  }

  return (
    <TeiEditorProvider editor={editor}>
      <div
        className={`tei-editor-wrapper rounded-[var(--tei-radius)] border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] ${className}`.trim()}
      >
        <EditorContent
          className={`min-h-[80px] ${editorClassName}`.trim()}
          placeholder={placeholder}
        />
        <InitialValuePlugin value={initialValue} format={initialFormat} />
        <OnChangePlugin onChange={onChange} format={format} />
        <KeyboardShortcutsPlugin />
        <ClickableLinkPlugin />
        <BubbleMenu />
        <LinkEditor />
      </div>
    </TeiEditorProvider>
  );
}
