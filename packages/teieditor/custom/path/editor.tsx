'use client';

import type { TeiEditorConfig, TeiExtension } from '@teispace/teieditor/core';
import { createTeiEditor, TeiEditorProvider } from '@teispace/teieditor/core';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import type { OutputFormat } from '@teispace/teieditor/plugins';
import {
  BubbleMenuPlugin,
  EditorContent,
  InitialValuePlugin,
  KeyboardShortcutsPlugin,
  OnChangePlugin,
} from '@teispace/teieditor/plugins';
import type { SerializationFormat } from '@teispace/teieditor/utils';
import { useEffect, useMemo, useState } from 'react';
import { Toolbar } from './toolbar';

export interface TeiEditorProps {
  /** Additional extensions on top of StarterKit. */
  extensions?: TeiExtension[];

  // -- Content ----------------------------------------------------------------

  /** Initial content to load into the editor. */
  initialValue?: string;
  /** Format of initialValue: 'html' | 'markdown' | 'json' | 'text'. Default: 'html'. */
  initialFormat?: SerializationFormat;

  // -- Output -----------------------------------------------------------------

  /** Called when content changes. Receives a string in the specified format. */
  onChange?: (value: string) => void;
  /**
   * Output format for onChange: 'html' | 'markdown' | 'json' | 'text'.
   * Default: 'html'.
   *
   * @example
   * ```tsx
   * // Get markdown output
   * <TeiEditor onChange={setMarkdown} format="markdown" />
   *
   * // Get JSON output (Lexical editor state)
   * <TeiEditor onChange={setJson} format="json" />
   *
   * // Get HTML output (default)
   * <TeiEditor onChange={setHtml} format="html" />
   * ```
   */
  format?: OutputFormat;

  // -- UI ---------------------------------------------------------------------

  /** Placeholder text. */
  placeholder?: string;
  /** Additional CSS class for the wrapper. */
  className?: string;
  /** Additional CSS class for the editable area. */
  editorClassName?: string;
  /** Whether to show the toolbar. Default: true. */
  showToolbar?: boolean;
  /** Whether to show the floating bubble menu on selection. Default: true. */
  showBubbleMenu?: boolean;
  /** Whether the editor is read-only. */
  readOnly?: boolean;
  /** Override the entire editor config. */
  config?: Partial<TeiEditorConfig>;
}

/**
 * Zero-config rich text editor with Notion-like experience.
 *
 * Supports import/export in HTML, Markdown, JSON, and plain text.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <TeiEditor onChange={setContent} />
 *
 * // Load from markdown, export as HTML
 * <TeiEditor
 *   initialValue="# Hello\n\nWorld"
 *   initialFormat="markdown"
 *   onChange={setHtml}
 *   format="html"
 * />
 *
 * // Load from HTML, export as markdown
 * <TeiEditor
 *   initialValue="<h1>Hello</h1><p>World</p>"
 *   initialFormat="html"
 *   onChange={setMarkdown}
 *   format="markdown"
 * />
 *
 * // JSON round-trip (for persistence)
 * <TeiEditor
 *   initialValue={savedJson}
 *   initialFormat="json"
 *   onChange={setSavedJson}
 *   format="json"
 * />
 * ```
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
  // Lexical requires a browser DOM — prevent SSR rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const editor = useMemo(
    () =>
      createTeiEditor({
        extensions: [...StarterKit, ...extensions],
        editable: !readOnly,
        ...config,
      }),
    [readOnly, extensions, config],
  );

  // Show skeleton during SSR / hydration
  if (!mounted) {
    return (
      <div
        className={`tei-editor-wrapper rounded-lg border border-border bg-background animate-pulse ${className}`.trim()}
      >
        {showToolbar && <div className="h-10 border-b border-border" />}
        <div className="min-h-[150px] p-4">
          <div className="h-4 w-48 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <TeiEditorProvider editor={editor}>
      <div
        className={`tei-editor-wrapper rounded-lg border border-border bg-background ${className}`.trim()}
      >
        {showToolbar && <Toolbar />}
        <div className="tei-editor-content relative">
          <EditorContent className={editorClassName} placeholder={placeholder} />
          <InitialValuePlugin value={initialValue} format={initialFormat} />
          <OnChangePlugin onChange={onChange} format={format} />
          <KeyboardShortcutsPlugin />
          {showBubbleMenu && <BubbleMenuPlugin />}
        </div>
      </div>
    </TeiEditorProvider>
  );
}
