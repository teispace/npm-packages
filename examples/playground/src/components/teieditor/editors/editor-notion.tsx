'use client';

import type { TeiEditorConfig, TeiExtension } from '@teispace/teieditor/core';
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import { SlashCommand, StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import type { OutputFormat } from '@teispace/teieditor/plugins';
import {
  AutoEmbedPlugin,
  ClickableLinkPlugin,
  CodeActionMenuPlugin,
  EditorContent,
  EmojiPickerPlugin,
  InitialValuePlugin,
  KeyboardShortcutsPlugin,
  OnChangePlugin,
  TabIndentationPlugin,
  TableCellResizerPlugin,
  TableHoverActionsPlugin,
} from '@teispace/teieditor/plugins';
import type { SerializationFormat } from '@teispace/teieditor/utils';
import { useEffect, useMemo, useState } from 'react';
import { BubbleMenu } from '../components/bubble-menu/bubble-menu';
import { ContextMenu } from '../components/context-menu/context-menu';
import { LinkEditor } from '../components/link-editor/link-editor';
import { SlashMenu } from '../components/slash-menu/slash-menu';
import { TableMenu } from '../components/table-menu/table-menu';

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
  /** Toggle the browser's native spell-check. Default `true`. */
  spellCheck?: boolean;
  config?: Partial<TeiEditorConfig>;
}

/**
 * Notion-style editor: no toolbar. Uses slash commands (/), floating bubble menu,
 * drag handles, context menu, and all other features.
 * Like Lexical Playground but without the fixed toolbar.
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
  spellCheck = true,
  config = {},
}: TeiEditorNotionProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const editor = useMemo(() => {
    // Configure SlashCommand with the styled menu
    const configuredStarterKit = StarterKit.map((ext) => {
      if (ext.name === 'slashCommand') {
        return SlashCommand.configure({
          menuRenderFn: (anchorRef: any, itemProps: any, matchingString: any) => (
            <SlashMenu
              anchorElementRef={anchorRef}
              itemProps={itemProps}
              matchingString={matchingString}
            />
          ),
        });
      }
      return ext;
    });

    return createTeiEditor({
      extensions: [...configuredStarterKit, ...extensions],
      editable: !readOnly,
      ...config,
    });
  }, [readOnly, extensions, config]);

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
        {/* No toolbar — Notion style */}
        <div className="tei-editor-content relative">
          <EditorContent
            className={editorClassName}
            placeholder={placeholder}
            spellCheck={spellCheck}
          />

          {/* Core plugins */}
          <InitialValuePlugin value={initialValue} format={initialFormat} />
          <OnChangePlugin onChange={onChange} format={format} />
          <KeyboardShortcutsPlugin />
          <TabIndentationPlugin />
          <ClickableLinkPlugin />

          {/* Floating menus — the primary UX in Notion mode */}
          <BubbleMenu />
          <LinkEditor />
          <CodeActionMenuPlugin />

          {/* Table enhancements */}
          <TableCellResizerPlugin />
          <TableHoverActionsPlugin />
          <TableMenu />

          {/* Context menu */}
          <ContextMenu />

          {/* Auto-detection */}
          <AutoEmbedPlugin />
          <EmojiPickerPlugin />
        </div>
      </div>
    </TeiEditorProvider>
  );
}
