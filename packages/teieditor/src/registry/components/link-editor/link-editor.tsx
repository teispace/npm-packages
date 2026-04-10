'use client';

import { $isLinkNode, $toggleLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isAtNodeEnd } from '@lexical/selection';
import { TOGGLE_LINK_EDITOR_COMMAND } from '@teispace/teieditor/extensions/link';
import { getSelectionRect, useFloatingPosition } from '@teispace/teieditor/utils';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TeiButton } from '../../ui/button.js';
import { IconCheck, IconExternalLink, IconUnlink } from '../../ui/icons.js';
import { TeiInput } from '../../ui/input.js';

/**
 * Floating link editor with view/edit modes.
 * Appears when:
 * - Ctrl+K is pressed (TOGGLE_LINK_EDITOR_COMMAND)
 * - Cursor is inside an existing link
 */
export function LinkEditor() {
  const [editor] = useLexicalComposerContext();
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [url, setUrl] = useState('');
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Listen for TOGGLE_LINK_EDITOR_COMMAND
  useEffect(() => {
    return editor.registerCommand(
      TOGGLE_LINK_EDITOR_COMMAND,
      () => {
        setEditMode(true);
        setVisible(true);
        setAnchorRect(getSelectionRect());
        requestAnimationFrame(() => inputRef.current?.focus());
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  // Detect when cursor is inside a link — show view mode
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          if (!editMode) setVisible(false);
          return;
        }

        const node = $isAtNodeEnd(selection.focus)
          ? selection.focus.getNode()
          : selection.anchor.getNode();
        const parent = node.getParent();
        const linkNode = $isLinkNode(parent) ? parent : $isLinkNode(node) ? node : null;

        if (linkNode) {
          setUrl(linkNode.getURL());
          setAnchorRect(getSelectionRect());
          if (!editMode) setVisible(true);
        } else if (!editMode) {
          setVisible(false);
        }
      });
    });
  }, [editor, editMode]);

  useFloatingPosition({
    anchorRect,
    floatingRef: editorRef,
    placement: 'bottom',
    offset: 8,
    visible,
  });

  const applyLink = useCallback(() => {
    editor.update(() => {
      $toggleLink(url.trim() || null);
    });
    setEditMode(false);
    if (!url.trim()) setVisible(false);
  }, [editor, url]);

  const removeLink = useCallback(() => {
    editor.update(() => {
      $toggleLink(null);
    });
    setVisible(false);
    setEditMode(false);
  }, [editor]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(false);
        setEditMode(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={editorRef}
      className={[
        'tei-link-editor fixed z-50 flex items-center gap-1.5 rounded-lg px-2 py-1.5 shadow-lg',
        'border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))]',
        'transition-opacity duration-150',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      style={{ position: 'fixed', top: -10000, left: -10000 }}
    >
      {editMode ? (
        /* Edit mode: URL input */
        <>
          <TeiInput
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-52"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
            }}
          />
          <TeiButton onClick={applyLink} title="Apply link" variant="default" size="sm">
            <IconCheck size={14} />
          </TeiButton>
          <TeiButton onClick={removeLink} title="Remove link" size="sm">
            <IconUnlink size={14} />
          </TeiButton>
        </>
      ) : (
        /* View mode: show URL */
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-[200px] truncate text-sm text-[hsl(var(--tei-primary))] underline"
          >
            {url}
          </a>
          <TeiButton
            onClick={() => {
              setEditMode(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            title="Edit link"
            size="sm"
          >
            <IconExternalLink size={14} />
          </TeiButton>
          <TeiButton onClick={removeLink} title="Remove link" size="sm">
            <IconUnlink size={14} />
          </TeiButton>
        </>
      )}
    </div>,
    document.body,
  );
}
