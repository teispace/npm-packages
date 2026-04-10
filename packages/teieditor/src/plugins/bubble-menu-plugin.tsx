import { $isLinkNode, $toggleLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isAtNodeEnd } from '@lexical/selection';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSelectedNode(selection: ReturnType<typeof $getSelection>) {
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor;
  const focus = selection.focus;
  const anchorNode = anchor.getNode();
  const focusNode = focus.getNode();
  if (anchorNode === focusNode) return anchorNode;
  const isBackward = selection.isBackward();
  return isBackward
    ? $isAtNodeEnd(focus)
      ? anchorNode
      : focusNode
    : $isAtNodeEnd(anchor)
      ? focusNode
      : anchorNode;
}

// ---------------------------------------------------------------------------
// Format button inside bubble
// ---------------------------------------------------------------------------

function BubbleButton({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-white/20 ${
        isActive ? 'text-white bg-white/20' : 'text-white/80'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
    >
      <span className="text-xs font-medium" aria-hidden>
        {icon}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface BubbleMenuPluginProps {
  /** Additional CSS class for the bubble menu. */
  className?: string;
}

/**
 * Floating toolbar that appears when text is selected.
 * Provides quick access to formatting and link insertion.
 */
export function BubbleMenuPlugin(/* props: BubbleMenuPluginProps = {} */) {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [formats, setFormats] = useState<Set<TextFormatType>>(new Set());
  const [isLink, setIsLink] = useState(false);

  const updateMenu = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        setVisible(false);
        return;
      }

      const nativeSelection = window.getSelection();
      if (!nativeSelection || nativeSelection.rangeCount === 0) {
        setVisible(false);
        return;
      }

      // Check formats
      const fmts = new Set<TextFormatType>();
      if (selection.hasFormat('bold')) fmts.add('bold');
      if (selection.hasFormat('italic')) fmts.add('italic');
      if (selection.hasFormat('underline')) fmts.add('underline');
      if (selection.hasFormat('strikethrough')) fmts.add('strikethrough');
      if (selection.hasFormat('code')) fmts.add('code');
      if (selection.hasFormat('highlight')) fmts.add('highlight');
      setFormats(fmts);

      // Check link
      const node = getSelectedNode(selection);
      const parent = node?.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));

      // Position above selection
      const range = nativeSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const menuWidth = 300; // approximate

      setPosition({
        top: rect.top - 48,
        left: Math.max(8, rect.left + rect.width / 2 - menuWidth / 2),
      });
      setVisible(true);
    });
  }, [editor]);

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      updateMenu();
    });
  }, [editor, updateMenu]);

  // Hide on scroll
  useEffect(() => {
    const hide = () => setVisible(false);
    document.addEventListener('scroll', hide, true);
    return () => document.removeEventListener('scroll', hide, true);
  }, []);

  const toggleFormat = useCallback(
    (format: TextFormatType) => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [editor],
  );

  const handleLink = useCallback(() => {
    if (isLink) {
      editor.update(() => $toggleLink(null));
    } else {
      const url = typeof window !== 'undefined' ? window.prompt('Enter URL:') : null;
      if (url) editor.update(() => $toggleLink(url));
    }
  }, [editor, isLink]);

  if (!visible || typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className="tei-bubble-menu fixed z-50 flex items-center gap-0.5 rounded-lg bg-gray-900 dark:bg-gray-800 px-1.5 py-1 shadow-xl animate-in fade-in-0 zoom-in-95"
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Text formatting"
    >
      <BubbleButton
        icon="B"
        label="Bold"
        isActive={formats.has('bold')}
        onClick={() => toggleFormat('bold')}
      />
      <BubbleButton
        icon="I"
        label="Italic"
        isActive={formats.has('italic')}
        onClick={() => toggleFormat('italic')}
      />
      <BubbleButton
        icon="U"
        label="Underline"
        isActive={formats.has('underline')}
        onClick={() => toggleFormat('underline')}
      />
      <BubbleButton
        icon="S"
        label="Strikethrough"
        isActive={formats.has('strikethrough')}
        onClick={() => toggleFormat('strikethrough')}
      />
      <BubbleButton
        icon="<>"
        label="Code"
        isActive={formats.has('code')}
        onClick={() => toggleFormat('code')}
      />
      <BubbleButton
        icon="H"
        label="Highlight"
        isActive={formats.has('highlight')}
        onClick={() => toggleFormat('highlight')}
      />
      <div className="mx-0.5 h-5 w-px bg-white/20" />
      <BubbleButton
        icon="🔗"
        label={isLink ? 'Remove link' : 'Add link'}
        isActive={isLink}
        onClick={handleLink}
      />
    </div>,
    document.body,
  );
}
