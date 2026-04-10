'use client';

import type { TeiEditorConfig, TeiExtension } from '@teispace/teieditor/core';
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import type { OutputFormat } from '@teispace/teieditor/plugins';
import {
  ClickableLinkPlugin,
  EditorContent,
  InitialValuePlugin,
  KeyboardShortcutsPlugin,
  OnChangePlugin,
  TabIndentationPlugin,
} from '@teispace/teieditor/plugins';
import type { SerializationFormat } from '@teispace/teieditor/utils';
import { useEffect, useMemo, useState } from 'react';
import { BubbleMenu } from '../components/bubble-menu/bubble-menu';
import { LinkEditor } from '../components/link-editor/link-editor';

export interface TeiEditorNotionProps {
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
 * Notion-style editor: no toolbar. Uses slash commands (/), floating bubble menu,
 * drag handles, and per-block placeholders.
 */
export function TeiEditorNotion({
  extensions = [],
  initialValue,
  initialFormat = 'html',
  onChange,
  format = 'html',
  placeholder = "Type '/' for commands...",
  className = '',
  editorClassName = '',
  readOnly = false,
  config = {},
}: TeiEditorNotionProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const editor = useMemo(
    () =>
      createTeiEditor({
        extensions: [...StarterKit, ...extensions],
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
        <div className="min-h-[200px] p-4">
          <div className="h-4 w-64 rounded bg-[hsl(var(--tei-muted))]" />
        </div>
      </div>
    );
  }

  return (
    <TeiEditorProvider editor={editor}>
      <div
        className={`tei-editor-wrapper rounded-[var(--tei-radius)] border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] ${className}`.trim()}
      >
        <div className="tei-editor-content relative">
          <EditorContent className={editorClassName} placeholder={placeholder} />
          <InitialValuePlugin value={initialValue} format={initialFormat} />
          <OnChangePlugin onChange={onChange} format={format} />
          <KeyboardShortcutsPlugin />
          <TabIndentationPlugin />
          <ClickableLinkPlugin />
          <BubbleMenu />
          <LinkEditor />
        </div>
      </div>
    </TeiEditorProvider>
  );
}
