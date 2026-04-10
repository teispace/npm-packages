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
import { BubbleMenu } from '../components/bubble-menu/bubble-menu.js';
import { ContextMenu } from '../components/context-menu/context-menu.js';
import { LinkEditor } from '../components/link-editor/link-editor.js';
import { SlashMenu } from '../components/slash-menu/slash-menu.js';
import { TableMenu } from '../components/table-menu/table-menu.js';
import { Toolbar } from '../components/toolbar/toolbar.js';

export interface TeiEditorProps {
  extensions?: TeiExtension[];
  initialValue?: string;
  initialFormat?: SerializationFormat;
  onChange?: (value: string) => void;
  format?: OutputFormat;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  showToolbar?: boolean;
  showBubbleMenu?: boolean;
  readOnly?: boolean;
  config?: Partial<TeiEditorConfig>;
}

/**
 * Full-featured WYSIWYG editor matching the Lexical Playground.
 * Includes: toolbar, floating text format bar, slash commands, link editor,
 * code action menu, table plugins, context menu, auto-embed, emoji picker.
 * SSR-safe: renders a skeleton during server-side rendering.
 */
export function TeiEditor({
  extensions = [],
  initialValue,
  initialFormat = 'html',
  onChange,
  format = 'html',
  placeholder = 'Start writing...',
  className = '',
  editorClassName = '',
  showToolbar = true,
  showBubbleMenu = true,
  readOnly = false,
  config = {},
}: TeiEditorProps) {
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
        {showToolbar && <div className="h-10 border-b border-[hsl(var(--tei-border))]" />}
        <div className="min-h-[150px] p-4">
          <div className="h-4 w-48 rounded bg-[hsl(var(--tei-muted))]" />
        </div>
      </div>
    );
  }

  return (
    <TeiEditorProvider editor={editor}>
      <div
        className={`tei-editor-wrapper rounded-[var(--tei-radius)] border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] ${className}`.trim()}
      >
        {showToolbar && <Toolbar />}
        <div className="tei-editor-content relative">
          <EditorContent className={editorClassName} placeholder={placeholder} />

          {/* Core plugins */}
          <InitialValuePlugin value={initialValue} format={initialFormat} />
          <OnChangePlugin onChange={onChange} format={format} />
          <KeyboardShortcutsPlugin />
          <TabIndentationPlugin />
          <ClickableLinkPlugin />

          {/* Floating menus */}
          {showBubbleMenu && <BubbleMenu />}
          <LinkEditor />
          <CodeActionMenuPlugin />

          {/* Table enhancements */}
          <TableCellResizerPlugin />
          <TableHoverActionsPlugin />
          <TableMenu />

          {/* Context menus */}
          <ContextMenu />

          {/* Auto-detection */}
          <AutoEmbedPlugin />
          <EmojiPickerPlugin />
        </div>
      </div>
    </TeiEditorProvider>
  );
}
