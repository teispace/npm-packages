'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, PASTE_COMMAND } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition } from '../utils/positioning.js';

// ---------------------------------------------------------------------------
// URL patterns for embeddable content
// ---------------------------------------------------------------------------

const EMBED_PATTERNS = [
  {
    name: 'YouTube',
    pattern: /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i,
    command: 'INSERT_YOUTUBE_COMMAND',
  },
  {
    name: 'Twitter',
    pattern: /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status\/\d+/i,
    command: 'INSERT_TWEET_COMMAND',
  },
  {
    name: 'Figma',
    pattern: /^https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\//i,
    command: 'INSERT_FIGMA_COMMAND',
  },
];

interface EmbedSuggestion {
  url: string;
  name: string;
  rect: DOMRect;
}

/**
 * Auto-embed plugin. Detects pasted URLs matching known embed patterns
 * and offers to convert them into embed nodes.
 */
export function AutoEmbedPlugin() {
  const [editor] = useLexicalComposerContext();
  const [suggestion, setSuggestion] = useState<EmbedSuggestion | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const popupRef = useRef<HTMLDivElement>(null);

  useFloatingPosition({
    anchorRect: suggestion?.rect ?? null,
    floatingRef: popupRef,
    placement: 'bottom',
    offset: 8,
    visible: suggestion !== null,
  });

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = event instanceof ClipboardEvent ? event.clipboardData : null;
        if (!clipboardData) return false;

        const text = clipboardData.getData('text/plain').trim();
        if (!text) return false;

        for (const embed of EMBED_PATTERNS) {
          if (embed.pattern.test(text)) {
            // Get cursor position for the popup
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              setSuggestion({ url: text, name: embed.name, rect });

              // Auto-dismiss after 8 seconds
              clearTimeout(timeoutRef.current);
              timeoutRef.current = setTimeout(() => setSuggestion(null), 8000);
            }
            break;
          }
        }

        // Don't prevent default paste — let the text be pasted
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  const handleEmbed = useCallback(() => {
    if (!suggestion) return;

    // Try to find and dispatch the right command
    // We use the generic INSERT_EMBED_COMMAND as fallback
    editor.update(() => {
      // Import and dispatch embed command
      import('@teispace/teieditor/extensions/embed').then(({ INSERT_EMBED_COMMAND }) => {
        editor.dispatchCommand(INSERT_EMBED_COMMAND, suggestion.url);
      });
    });

    setSuggestion(null);
  }, [editor, suggestion]);

  const handleDismiss = useCallback(() => {
    setSuggestion(null);
  }, []);

  if (!suggestion || typeof window === 'undefined') return null;

  return createPortal(
    <div
      ref={popupRef}
      className="tei-auto-embed z-50 flex items-center gap-2 rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] px-3 py-2 shadow-lg transition-opacity"
    >
      <span className="text-sm text-[hsl(var(--tei-popover-fg))]">Embed as {suggestion.name}?</span>
      <button
        type="button"
        onClick={handleEmbed}
        className="rounded-md bg-[hsl(var(--tei-primary))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--tei-primary-fg))] hover:opacity-90"
      >
        Embed
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded-md px-2 py-1 text-xs text-[hsl(var(--tei-muted-fg))] hover:bg-[hsl(var(--tei-accent))]"
      >
        Dismiss
      </button>
    </div>,
    document.body,
  );
}
