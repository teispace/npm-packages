'use client';

import { $isLinkNode } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isAtNodeEnd } from '@lexical/selection';
import { TOGGLE_LINK_EDITOR_COMMAND } from '@teispace/teieditor/extensions/link';
import { getSelectionRect, useFloatingPosition } from '@teispace/teieditor/utils';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TeiButton } from '../../ui/button.js';
import {
  IconBold,
  IconCode,
  IconHighlight,
  IconItalic,
  IconLink,
  IconStrikethrough,
  IconUnderline,
} from '../../ui/icons.js';
import { TeiSeparator } from '../../ui/separator.js';

/**
 * Floating formatting toolbar that appears when text is selected.
 * Shows formatting buttons and a link toggle.
 */
export function BubbleMenu() {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [formats, setFormats] = useState<Set<TextFormatType>>(new Set());
  const [isLink, setIsLink] = useState(false);

  // Track selection changes
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

        // Read formats
        const fmts = new Set<TextFormatType>();
        if (selection.hasFormat('bold')) fmts.add('bold');
        if (selection.hasFormat('italic')) fmts.add('italic');
        if (selection.hasFormat('underline')) fmts.add('underline');
        if (selection.hasFormat('strikethrough')) fmts.add('strikethrough');
        if (selection.hasFormat('code')) fmts.add('code');
        if (selection.hasFormat('highlight')) fmts.add('highlight');
        setFormats(fmts);

        // Check link
        const node = $isAtNodeEnd(selection.focus)
          ? selection.focus.getNode()
          : selection.anchor.getNode();
        const parent = node.getParent();
        setIsLink($isLinkNode(parent) || $isLinkNode(node));

        // Position
        setAnchorRect(getSelectionRect());
        setVisible(true);
      });
    });
  }, [editor]);

  // Position the floating menu
  useFloatingPosition({
    anchorRect,
    floatingRef: menuRef,
    placement: 'top',
    offset: 10,
    visible,
  });

  const toggleFormat = useCallback(
    (format: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format),
    [editor],
  );

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className={[
        'tei-bubble-menu fixed z-50 flex items-center gap-0.5 rounded-lg px-1.5 py-1 shadow-xl',
        'bg-[hsl(var(--tei-bubble-bg))] border border-[hsl(var(--tei-border))]',
        'transition-opacity duration-150',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      role="toolbar"
      aria-label="Text formatting"
      style={{ position: 'fixed', top: -10000, left: -10000 }}
    >
      <TeiButton
        onClick={() => toggleFormat('bold')}
        active={formats.has('bold')}
        title="Bold"
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconBold size={14} />
      </TeiButton>
      <TeiButton
        onClick={() => toggleFormat('italic')}
        active={formats.has('italic')}
        title="Italic"
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconItalic size={14} />
      </TeiButton>
      <TeiButton
        onClick={() => toggleFormat('underline')}
        active={formats.has('underline')}
        title="Underline"
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconUnderline size={14} />
      </TeiButton>
      <TeiButton
        onClick={() => toggleFormat('strikethrough')}
        active={formats.has('strikethrough')}
        title="Strikethrough"
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconStrikethrough size={14} />
      </TeiButton>
      <TeiButton
        onClick={() => toggleFormat('code')}
        active={formats.has('code')}
        title="Code"
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconCode size={14} />
      </TeiButton>
      <TeiButton
        onClick={() => toggleFormat('highlight')}
        active={formats.has('highlight')}
        title="Highlight"
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconHighlight size={14} />
      </TeiButton>
      <TeiSeparator className="bg-white/20" />
      <TeiButton
        onClick={() => editor.dispatchCommand(TOGGLE_LINK_EDITOR_COMMAND, undefined)}
        active={isLink}
        title={isLink ? 'Edit link' : 'Add link'}
        className="text-[hsl(var(--tei-bubble-fg))] hover:bg-white/10"
      >
        <IconLink size={14} />
      </TeiButton>
    </div>,
    document.body,
  );
}
