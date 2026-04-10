'use client';

import { useCallback, useMemo } from 'react';
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { SlashCommand } from '@teispace/teieditor/extensions/slash-command';
import { Mention } from '@teispace/teieditor/extensions/mention';
import { Image } from '@teispace/teieditor/extensions/image';
import { FontFamily } from '@teispace/teieditor/extensions/font-family';
import {
  EditorContent,
  OnChangePlugin,
  KeyboardShortcutsPlugin,
  TabIndentationPlugin,
  ClickableLinkPlugin,
  CodeActionMenuPlugin,
  TableCellResizerPlugin,
  TableHoverActionsPlugin,
  AutoEmbedPlugin,
  EmojiPickerPlugin,
} from '@teispace/teieditor/plugins';
import type { OutputFormat } from '@teispace/teieditor/plugins';

// Registry UI components
import { Toolbar } from './teieditor/components/toolbar/toolbar';
import { BubbleMenu } from './teieditor/components/bubble-menu/bubble-menu';
import { LinkEditor } from './teieditor/components/link-editor/link-editor';
import { SlashMenu } from './teieditor/components/slash-menu/slash-menu';
import { MentionList } from './teieditor/components/mention-list/mention-list';
import { TableMenu } from './teieditor/components/table-menu/table-menu';
import { ContextMenu } from './teieditor/components/context-menu/context-menu';

// Sample users for @mention
const USERS = [
  { id: '1', name: 'Krishna Adhikari' },
  { id: '2', name: 'John Doe' },
  { id: '3', name: 'Jane Smith' },
  { id: '4', name: 'Alice Johnson' },
  { id: '5', name: 'Tony Stark' },
];

interface PlaygroundEditorProps {
  onChange: (value: string) => void;
  format: OutputFormat;
  mode: 'full' | 'notion';
}

export function PlaygroundEditor({ onChange, format = 'html', mode = 'full' }: PlaygroundEditorProps) {
  // Slash menu render function — wires the registry UI to the headless plugin
  const slashMenuRenderFn = useCallback(
    (anchorElementRef: any, itemProps: any, matchingString: string) => (
      <SlashMenu
        anchorElementRef={anchorElementRef}
        itemProps={itemProps}
        matchingString={matchingString}
      />
    ),
    [],
  );

  // Mention list render function
  const mentionMenuRenderFn = useCallback(
    (anchorElementRef: any, itemProps: any, matchingString: string) => (
      <MentionList
        anchorElementRef={anchorElementRef}
        itemProps={itemProps}
        matchingString={matchingString}
      />
    ),
    [],
  );

  const editor = useMemo(
    () =>
      createTeiEditor({
        extensions: [
          // StarterKit minus SlashCommand, Mention, FontFamily (we configure them custom)
          ...StarterKit.filter(
            (ext) =>
              ext.name !== 'slashCommand' &&
              ext.name !== 'mention' &&
              ext.name !== 'fontFamily',
          ),
          SlashCommand.configure({
            menuRenderFn: slashMenuRenderFn,
          }),
          Mention.configure({
            trigger: '@',
            onSearch: (query) => {
              const q = query.toLowerCase();
              return USERS.filter((u) => u.name.toLowerCase().includes(q));
            },
            menuRenderFn: mentionMenuRenderFn,
          }),
          Image.configure({
            maxSize: 10 * 1024 * 1024,
          }),
          FontFamily.configure({
            families: [
              { label: 'Default', value: '' },
              { label: 'Arial', value: 'Arial, sans-serif' },
              { label: 'Georgia', value: 'Georgia, serif' },
              { label: 'Times New Roman', value: '"Times New Roman", serif' },
              { label: 'Courier New', value: '"Courier New", monospace' },
              { label: 'Verdana', value: 'Verdana, sans-serif' },
              { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
              { label: 'Inter', value: 'Inter, sans-serif' },
            ],
          }),
        ],
      }),
    [slashMenuRenderFn, mentionMenuRenderFn],
  );

  return (
    <TeiEditorProvider editor={editor}>
      <div className="tei-editor-wrapper rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))]">
        {mode === 'full' && <Toolbar />}
        <div className="tei-editor-content relative">
          <EditorContent
            className="min-h-[500px]"
            placeholder={
              mode === 'notion'
                ? "Type '/' for commands, '@' for mentions..."
                : "Start writing, or type '/' for commands..."
            }
          />

          {/* Core plugins */}
          <OnChangePlugin onChange={onChange} format={format} />
          <KeyboardShortcutsPlugin />
          <TabIndentationPlugin />
          <ClickableLinkPlugin />

          {/* Floating menus */}
          <BubbleMenu />
          <LinkEditor />

          {/* Code block actions (language + copy) */}
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
