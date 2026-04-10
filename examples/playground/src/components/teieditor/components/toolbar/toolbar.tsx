'use client';

import { $isCodeNode } from '@lexical/code';
import { $isListNode, ListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isHeadingNode } from '@lexical/rich-text';
import { $findMatchingParent, $getNearestNodeOfType } from '@lexical/utils';
import { TOGGLE_LINK_EDITOR_COMMAND } from '@teispace/teieditor/extensions/link';
import {
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  type TextFormatType,
  UNDO_COMMAND,
} from 'lexical';
import { useCallback, useEffect, useState } from 'react';
import {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconCode,
  IconHighlight,
  IconIndent,
  IconItalic,
  IconLink,
  IconOutdent,
  IconRedo,
  IconSearch,
  IconStrikethrough,
  IconSubscript,
  IconSuperscript,
  IconUnderline,
  IconUndo,
} from '../../ui/icons';
import { BlockTypeDropdown } from './block-type-dropdown';
import { InsertDropdown } from './insert-dropdown';
import { TextColorButton } from './text-color-button';
import { ToolbarButton } from './toolbar-button';
import { ToolbarGroup } from './toolbar-group';

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export interface ToolbarProps {
  className?: string;
}

/**
 * Full-featured toolbar with proper icons, dropdowns, and grouped sections.
 * Copy this into your project and customize freely.
 */
export function Toolbar({ className = '' }: ToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const [activeFormats, setActiveFormats] = useState<Set<TextFormatType>>(new Set());
  const [blockType, setBlockType] = useState<string>('paragraph');
  const [elementFormat, setElementFormat] = useState<ElementFormatType>('left');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Sync toolbar state with editor selection
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        // Text formats
        const formats = new Set<TextFormatType>();
        if (selection.hasFormat('bold')) formats.add('bold');
        if (selection.hasFormat('italic')) formats.add('italic');
        if (selection.hasFormat('underline')) formats.add('underline');
        if (selection.hasFormat('strikethrough')) formats.add('strikethrough');
        if (selection.hasFormat('code')) formats.add('code');
        if (selection.hasFormat('highlight')) formats.add('highlight');
        if (selection.hasFormat('subscript')) formats.add('subscript');
        if (selection.hasFormat('superscript')) formats.add('superscript');
        setActiveFormats(formats);

        // Block type
        const anchorNode = selection.anchor.getNode();
        const element =
          anchorNode.getKey() === 'root'
            ? anchorNode
            : ($findMatchingParent(anchorNode, (e) => {
                const parent = e.getParent();
                return parent !== null && $isRootOrShadowRoot(parent);
              }) ?? anchorNode.getTopLevelElementOrThrow());

        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType(anchorNode, ListNode);
          const type = parentList ? parentList.getListType() : element.getListType();
          setBlockType(type === 'number' ? 'number' : type === 'check' ? 'check' : 'bullet');
        } else if ($isHeadingNode(element)) {
          setBlockType(element.getTag());
        } else if ($isCodeNode(element)) {
          setBlockType('code');
        } else if (element.getType() === 'quote') {
          setBlockType('quote');
        } else {
          setBlockType('paragraph');
        }

        // Element format
        if ('getFormatType' in element && typeof element.getFormatType === 'function') {
          setElementFormat((element.getFormatType() as ElementFormatType) || 'left');
        }
      });
    });
  }, [editor]);

  // Undo/redo state
  useEffect(() => {
    const u1 = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (p) => {
        setCanUndo(p);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const u2 = editor.registerCommand(
      CAN_REDO_COMMAND,
      (p) => {
        setCanRedo(p);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      u1();
      u2();
    };
  }, [editor]);

  const toggleFormat = useCallback(
    (f: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, f),
    [editor],
  );

  return (
    <div
      className={`tei-toolbar flex flex-wrap items-center gap-0.5 overflow-x-auto border-b border-[hsl(var(--tei-toolbar-border))] bg-[hsl(var(--tei-toolbar-bg))] px-2 py-1.5 ${className}`.trim()}
      role="toolbar"
      aria-label="Editor toolbar"
    >
      {/* History */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          icon={<IconUndo />}
        />
        <ToolbarButton
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          icon={<IconRedo />}
        />
      </ToolbarGroup>

      {/* Block type */}
      <ToolbarGroup>
        <BlockTypeDropdown blockType={blockType} />
      </ToolbarGroup>

      {/* Text formatting */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => toggleFormat('bold')}
          active={activeFormats.has('bold')}
          title="Bold (Ctrl+B)"
          icon={<IconBold />}
        />
        <ToolbarButton
          onClick={() => toggleFormat('italic')}
          active={activeFormats.has('italic')}
          title="Italic (Ctrl+I)"
          icon={<IconItalic />}
        />
        <ToolbarButton
          onClick={() => toggleFormat('underline')}
          active={activeFormats.has('underline')}
          title="Underline (Ctrl+U)"
          icon={<IconUnderline />}
        />
        <ToolbarButton
          onClick={() => toggleFormat('strikethrough')}
          active={activeFormats.has('strikethrough')}
          title="Strikethrough"
          icon={<IconStrikethrough />}
        />
        <ToolbarButton
          onClick={() => toggleFormat('code')}
          active={activeFormats.has('code')}
          title="Inline Code (Ctrl+E)"
          icon={<IconCode />}
        />
        <ToolbarButton
          onClick={() => toggleFormat('highlight')}
          active={activeFormats.has('highlight')}
          title="Highlight"
          icon={<IconHighlight />}
        />
      </ToolbarGroup>

      {/* Colors */}
      <ToolbarGroup>
        <TextColorButton />
      </ToolbarGroup>

      {/* Link */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.dispatchCommand(TOGGLE_LINK_EDITOR_COMMAND, undefined)}
          title="Insert Link (Ctrl+K)"
          icon={<IconLink />}
        />
      </ToolbarGroup>

      {/* Alignment — hidden on small screens */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}
          active={elementFormat === 'left'}
          title="Align Left"
          icon={<IconAlignLeft />}
        />
        <ToolbarButton
          onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}
          active={elementFormat === 'center'}
          title="Align Center"
          icon={<IconAlignCenter />}
        />
        <ToolbarButton
          onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}
          active={elementFormat === 'right'}
          title="Align Right"
          icon={<IconAlignRight />}
        />
        <ToolbarButton
          onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')}
          active={elementFormat === 'justify'}
          title="Justify"
          icon={<IconAlignJustify />}
        />
      </ToolbarGroup>

      {/* Indent/Outdent */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)}
          title="Indent"
          icon={<IconIndent />}
        />
        <ToolbarButton
          onClick={() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)}
          title="Outdent"
          icon={<IconOutdent />}
        />
      </ToolbarGroup>

      {/* Insert */}
      <ToolbarGroup showSeparator={false}>
        <InsertDropdown />
      </ToolbarGroup>

      {/* Find & Replace */}
      <ToolbarButton
        onClick={() => window.dispatchEvent(new CustomEvent('tei-find-replace-toggle'))}
        title="Find & Replace (Ctrl+F)"
        icon={<IconSearch />}
      />
    </div>
  );
}
