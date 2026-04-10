'use client';

import { $isLinkNode, $toggleLink } from '@lexical/link';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isAtNodeEnd } from '@lexical/selection';
import { TOGGLE_LINK_EDITOR_COMMAND } from '@teispace/teieditor/extensions/link';
import { getSelectionRect, useFloatingPosition } from '@teispace/teieditor/utils';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TeiButton } from '../../ui/button';
import { IconCheck, IconExternalLink, IconUnlink } from '../../ui/icons';
import { TeiInput } from '../../ui/input';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const URL_REGEX = /^https?:\/\//i;
const MAILTO_REGEX = /^mailto:/i;

function isValidUrl(url: string): boolean {
  if (!url.trim()) return false;
  return URL_REGEX.test(url) || MAILTO_REGEX.test(url);
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Auto-add https:// if no protocol
  if (!URL_REGEX.test(trimmed) && !MAILTO_REGEX.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// LinkEditor
// ---------------------------------------------------------------------------

/**
 * Floating link editor with view/edit modes and URL validation.
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
  const [isInvalid, setIsInvalid] = useState(false);
  const [openInNewTab, setOpenInNewTab] = useState(true);

  // Listen for TOGGLE_LINK_EDITOR_COMMAND
  useEffect(() => {
    return editor.registerCommand(
      TOGGLE_LINK_EDITOR_COMMAND,
      () => {
        setEditMode(true);
        setVisible(true);
        setIsInvalid(false);
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
    const sanitized = sanitizeUrl(url);
    if (!isValidUrl(sanitized)) {
      setIsInvalid(true);
      return;
    }

    editor.update(() => {
      $toggleLink(sanitized, openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {});
    });
    setEditMode(false);
    setIsInvalid(false);
  }, [editor, url, openInNewTab]);

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
        setIsInvalid(false);
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
        'tei-link-editor fixed z-50 flex flex-col gap-2 rounded-lg px-3 py-2.5 shadow-lg',
        'border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))]',
        'transition-opacity duration-150',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      style={{ position: 'fixed', top: -10000, left: -10000 }}
    >
      {editMode ? (
        /* Edit mode */
        <>
          <div className="flex items-center gap-1.5">
            <TeiInput
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setIsInvalid(false);
              }}
              placeholder="https://..."
              className={`w-56 ${isInvalid ? 'border-red-500 focus:border-red-500' : ''}`}
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
          </div>
          {isInvalid && (
            <p className="text-xs text-red-500">Please enter a valid URL</p>
          )}
          <label className="flex items-center gap-2 text-xs text-[hsl(var(--tei-muted-fg))]">
            <input
              type="checkbox"
              checked={openInNewTab}
              onChange={(e) => setOpenInNewTab(e.target.checked)}
              className="rounded"
            />
            Open in new tab
          </label>
        </>
      ) : (
        /* View mode */
        <div className="flex items-center gap-1.5">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-[240px] truncate text-sm text-[hsl(var(--tei-primary))] underline"
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
        </div>
      )}
    </div>,
    document.body,
  );
}
