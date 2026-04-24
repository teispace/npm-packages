'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TOGGLE_LINK_EDITOR_COMMAND } from '@teispace/teieditor/extensions/link';
import { useToolbarState } from '@teispace/teieditor/plugins';
import { getSelectionRect, useFloatingPosition } from '@teispace/teieditor/utils';
import { $getSelection, $isRangeSelection, type TextFormatType } from 'lexical';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TeiButton } from '../../ui/button';
import {
  IconBold,
  IconCode,
  IconHighlight,
  IconItalic,
  IconLink,
  IconStrikethrough,
  IconSubscript,
  IconSuperscript,
  IconUnderline,
} from '../../ui/icons';
import { TeiSeparator } from '../../ui/separator';

// ---------------------------------------------------------------------------
// BubbleMenu (Floating Text Format Toolbar)
// ---------------------------------------------------------------------------

/**
 * Floating formatting toolbar that appears when text is selected.
 * Like Lexical Playground's FloatingTextFormatToolbarPlugin.
 * Uses shared ToolbarContext for format state.
 */
export function BubbleMenu() {
  const [editor] = useLexicalComposerContext();
  const toolbar = useToolbarState();
  const menuRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Track selection changes to show/hide
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed() || editor.isComposing()) {
          setVisible(false);
          return;
        }

        const rawText = selection.getTextContent();
        if (!rawText.trim()) {
          setVisible(false);
          return;
        }

        setAnchorRect(getSelectionRect());
        setVisible(true);
      });
    });
  }, [editor]);

  useFloatingPosition({
    anchorRect,
    floatingRef: menuRef,
    placement: 'top',
    offset: 10,
    visible,
  });

  if (typeof window === 'undefined') return null;

  const formatButton = (format: TextFormatType, icon: React.ReactNode, title: string) => (
    <TeiButton
      onClick={() => toolbar.toggleFormat(format)}
      active={toolbar.activeFormats.has(format)}
      title={title}
      className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
    >
      {icon}
    </TeiButton>
  );

  return createPortal(
    <div
      ref={menuRef}
      className={[
        'tei-bubble-menu z-50 flex items-center gap-0.5 rounded-lg px-1.5 py-1 shadow-xl',
        'bg-[hsl(var(--tei-bubble-bg))] border border-[hsl(var(--tei-border))]',
        'transition-opacity duration-150',
      ].join(' ')}
      role="toolbar"
      aria-label="Text formatting"
    >
      {formatButton('bold', <IconBold size={14} />, 'Bold (Ctrl+B)')}
      {formatButton('italic', <IconItalic size={14} />, 'Italic (Ctrl+I)')}
      {formatButton('underline', <IconUnderline size={14} />, 'Underline (Ctrl+U)')}
      {formatButton('strikethrough', <IconStrikethrough size={14} />, 'Strikethrough')}
      {formatButton('code', <IconCode size={14} />, 'Code')}
      {formatButton('highlight', <IconHighlight size={14} />, 'Highlight')}

      <TeiSeparator className="bg-white/20" />

      {formatButton('subscript', <IconSubscript size={14} />, 'Subscript')}
      {formatButton('superscript', <IconSuperscript size={14} />, 'Superscript')}

      <TeiSeparator className="bg-white/20" />

      <TeiButton
        onClick={() => editor.dispatchCommand(TOGGLE_LINK_EDITOR_COMMAND, undefined)}
        active={toolbar.isLink}
        title={toolbar.isLink ? 'Edit link' : 'Add link (Ctrl+K)'}
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconLink size={14} />
      </TeiButton>
    </div>,
    document.body,
  );
}
