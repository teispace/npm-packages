'use client';

import { useCallback, useMemo } from 'react';
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { SlashCommand } from '@teispace/teieditor/extensions/slash-command';
import { Mention } from '@teispace/teieditor/extensions/mention';
import { Image } from '@teispace/teieditor/extensions/image';
import {
  EditorContent,
  OnChangePlugin,
  KeyboardShortcutsPlugin,
  TabIndentationPlugin,
  ClickableLinkPlugin,
} from '@teispace/teieditor/plugins';
import type { OutputFormat } from '@teispace/teieditor/plugins';

// Registry UI components
import { Toolbar } from './teieditor/components/toolbar/toolbar';
import { BubbleMenu } from './teieditor/components/bubble-menu/bubble-menu';
import { LinkEditor } from './teieditor/components/link-editor/link-editor';
import { SlashMenu } from './teieditor/components/slash-menu/slash-menu';
import { MentionList } from './teieditor/components/mention-list/mention-list';
import { CodeBar } from './teieditor/components/code-bar/code-bar';
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

export function PlaygroundEditor({
  onChange,
  format = 'html',
}: {
  onChange: (value: string) => void;
  format: OutputFormat;
}) {
  // Slash menu render function — wires the registry UI to the headless plugin
  const slashMenuRenderFn = useCallback(
    (anchorElementRef: any, itemProps: any, matchingString: string) => {
      return (
        <SlashMenu
          anchorElementRef={anchorElementRef}
          itemProps={itemProps}
          matchingString={matchingString}
        />
      );
    },
    [],
  );

  // Mention list render function
  const mentionMenuRenderFn = useCallback(
    (anchorElementRef: any, itemProps: any, matchingString: string) => {
      return (
        <MentionList
          anchorElementRef={anchorElementRef}
          itemProps={itemProps}
          matchingString={matchingString}
        />
      );
    },
    [],
  );

  const editor = useMemo(
    () =>
      createTeiEditor({
        extensions: [
          // Use StarterKit but replace SlashCommand and Mention with configured versions
          ...StarterKit.filter(
            (ext) => ext.name !== 'slashCommand' && ext.name !== 'mention',
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
        ],
      }),
    [slashMenuRenderFn, mentionMenuRenderFn],
  );

  return (
    <TeiEditorProvider editor={editor}>
      <div className="tei-editor-wrapper rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))]">
        <Toolbar />
        <div className="tei-editor-content relative">
          <EditorContent
            className="min-h-[500px]"
            placeholder="Start writing, or type '/' for commands..."
          />
          <OnChangePlugin onChange={onChange} format={format} />
          <KeyboardShortcutsPlugin />
          <TabIndentationPlugin />
          <ClickableLinkPlugin />
          <BubbleMenu />
          <LinkEditor />
          <CodeBar />
          <TableMenu />
          <ContextMenu />
        </div>
      </div>
    </TeiEditorProvider>
  );
}
