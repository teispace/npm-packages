'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useTeiEditor } from '@teispace/teieditor/core';
import { TOGGLE_LINK_EDITOR_COMMAND } from '@teispace/teieditor/extensions/link';
import { useToolbarState } from '@teispace/teieditor/plugins';
import {
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import { useCallback, useMemo, useState } from 'react';
import { Dropdown, DropdownItem } from '../../ui/dropdown.js';
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
} from '../../ui/icons.js';
import { BlockTypeDropdown } from './block-type-dropdown.js';
import { InsertDropdown } from './insert-dropdown.js';
import { TextColorButton } from './text-color-button.js';
import { ToolbarButton } from './toolbar-button.js';
import { ToolbarGroup } from './toolbar-group.js';

// ---------------------------------------------------------------------------
// Default font families (used when FontFamily extension is not configured)
// ---------------------------------------------------------------------------

const DEFAULT_FONT_FAMILIES: Array<{ label: string; value: string }> = [
  { label: 'Default', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
];

// ---------------------------------------------------------------------------
// Font size helpers
// ---------------------------------------------------------------------------

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;
const DEFAULT_FONT_SIZE = 15;

function parseFontSize(raw: string): number {
  const n = parseInt(raw, 10);
  return isNaN(n) ? DEFAULT_FONT_SIZE : n;
}

function calculateNextFontSize(current: number, direction: 'up' | 'down'): number {
  if (direction === 'up') {
    if (current < 12) return current + 1;
    if (current < 28) return current + 2;
    if (current < 36) return current + 4;
    if (current < 48) return current + 6;
    return Math.min(current + 12, MAX_FONT_SIZE);
  }
  if (current > 48) return current - 12;
  if (current > 36) return current - 6;
  if (current > 28) return current - 4;
  if (current > 12) return current - 2;
  return Math.max(current - 1, MIN_FONT_SIZE);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export interface ToolbarProps {
  className?: string;
  /**
   * Custom font families to show in the dropdown.
   * Overrides the FontFamily extension config.
   *
   * @example
   * ```tsx
   * <Toolbar fontFamilies={[
   *   { label: 'Default', value: '' },
   *   { label: 'Inter', value: 'Inter, sans-serif' },
   *   { label: 'Fira Code', value: '"Fira Code", monospace' },
   * ]} />
   * ```
   */
  fontFamilies?: Array<{ label: string; value: string }>;
}

/**
 * Full-featured toolbar matching Lexical Playground.
 * Uses shared ToolbarContext for state. Copy and customize freely.
 *
 * Font families are read from:
 * 1. `fontFamilies` prop (highest priority)
 * 2. FontFamily extension config (if configured)
 * 3. Built-in defaults (Arial, Courier New, Georgia, etc.)
 */
export function Toolbar({ className = '', fontFamilies }: ToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const teiEditor = useTeiEditor();
  const toolbar = useToolbarState();
  const [fontSizeInput, setFontSizeInput] = useState('');

  // Resolve font families: prop > extension config > defaults
  const resolvedFontFamilies: Array<{ label: string; value: string }> = useMemo(() => {
    if (fontFamilies) return fontFamilies;

    // Try to read from FontFamily extension config
    const fontFamilyExt = teiEditor.extensions.find((ext) => ext.name === 'fontFamily');
    if (fontFamilyExt) {
      const config = (fontFamilyExt as any).config;
      if (config?.families?.length > 0) return config.families;
    }

    return DEFAULT_FONT_FAMILIES;
  }, [fontFamilies, teiEditor.extensions]);

  const currentFontSize = parseFontSize(toolbar.fontSize);

  const handleFontSizeChange = useCallback(
    (direction: 'up' | 'down') => {
      const next = calculateNextFontSize(currentFontSize, direction);
      toolbar.applyFontSize(`${next}px`);
    },
    [currentFontSize, toolbar],
  );

  const handleFontSizeInput = useCallback(
    (val: string) => {
      setFontSizeInput(val);
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE) {
        toolbar.applyFontSize(`${n}px`);
      }
    },
    [toolbar],
  );

  const isCodeBlock = toolbar.blockType === 'code';

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
          disabled={!toolbar.canUndo}
          title="Undo (Ctrl+Z)"
          icon={<IconUndo />}
        />
        <ToolbarButton
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          disabled={!toolbar.canRedo}
          title="Redo (Ctrl+Y)"
          icon={<IconRedo />}
        />
      </ToolbarGroup>

      {/* Block type */}
      <ToolbarGroup>
        <BlockTypeDropdown blockType={toolbar.blockType} />
      </ToolbarGroup>

      {isCodeBlock ? (
        /* Code block mode: show language selector */
        <ToolbarGroup showSeparator={false}>
          <span className="px-2 text-xs text-[hsl(var(--tei-muted-fg))]">
            {toolbar.codeLanguage}
          </span>
        </ToolbarGroup>
      ) : (
        <>
          {/* Font family */}
          <ToolbarGroup>
            <Dropdown
              trigger={
                <span className="max-w-[100px] truncate text-xs">
                  {resolvedFontFamilies.find((f) => f.value === toolbar.fontFamily)?.label ||
                    toolbar.fontFamily ||
                    'Default'}
                </span>
              }
              triggerClassName="h-8 px-2 min-w-[80px]"
            >
              {resolvedFontFamilies.map((font) => (
                <DropdownItem
                  key={font.value || '__default'}
                  onClick={() => toolbar.applyFontFamily(font.value)}
                  active={toolbar.fontFamily === font.value}
                >
                  <span style={{ fontFamily: font.value || undefined }}>{font.label}</span>
                </DropdownItem>
              ))}
            </Dropdown>
          </ToolbarGroup>

          {/* Font size */}
          <ToolbarGroup>
            <button
              type="button"
              onClick={() => handleFontSizeChange('down')}
              disabled={currentFontSize <= MIN_FONT_SIZE}
              className="tei-font-size-btn flex h-7 w-5 items-center justify-center rounded text-xs text-[hsl(var(--tei-fg))] hover:bg-[hsl(var(--tei-accent))] disabled:opacity-40"
              title="Decrease font size"
            >
              -
            </button>
            <input
              type="text"
              value={fontSizeInput || currentFontSize}
              onChange={(e) => handleFontSizeInput(e.target.value)}
              onFocus={() => setFontSizeInput(String(currentFontSize))}
              onBlur={() => setFontSizeInput('')}
              className="h-7 w-8 rounded border border-[hsl(var(--tei-border))] bg-transparent text-center text-xs text-[hsl(var(--tei-fg))] outline-none focus:border-[hsl(var(--tei-primary))]"
              title="Font size"
            />
            <button
              type="button"
              onClick={() => handleFontSizeChange('up')}
              disabled={currentFontSize >= MAX_FONT_SIZE}
              className="tei-font-size-btn flex h-7 w-5 items-center justify-center rounded text-xs text-[hsl(var(--tei-fg))] hover:bg-[hsl(var(--tei-accent))] disabled:opacity-40"
              title="Increase font size"
            >
              +
            </button>
          </ToolbarGroup>

          {/* Text formatting */}
          <ToolbarGroup>
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('bold')}
              active={toolbar.activeFormats.has('bold')}
              title="Bold (Ctrl+B)"
              icon={<IconBold />}
            />
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('italic')}
              active={toolbar.activeFormats.has('italic')}
              title="Italic (Ctrl+I)"
              icon={<IconItalic />}
            />
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('underline')}
              active={toolbar.activeFormats.has('underline')}
              title="Underline (Ctrl+U)"
              icon={<IconUnderline />}
            />
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('strikethrough')}
              active={toolbar.activeFormats.has('strikethrough')}
              title="Strikethrough"
              icon={<IconStrikethrough />}
            />
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('code')}
              active={toolbar.activeFormats.has('code')}
              title="Inline Code (Ctrl+E)"
              icon={<IconCode />}
            />
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('highlight')}
              active={toolbar.activeFormats.has('highlight')}
              title="Highlight"
              icon={<IconHighlight />}
            />
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('subscript')}
              active={toolbar.activeFormats.has('subscript')}
              title="Subscript"
              icon={<IconSubscript />}
            />
            <ToolbarButton
              onClick={() => toolbar.toggleFormat('superscript')}
              active={toolbar.activeFormats.has('superscript')}
              title="Superscript"
              icon={<IconSuperscript />}
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
              active={toolbar.isLink}
              title="Insert Link (Ctrl+K)"
              icon={<IconLink />}
            />
          </ToolbarGroup>

          {/* Clear formatting */}
          <ToolbarGroup>
            <ToolbarButton
              onClick={toolbar.clearFormatting}
              title="Clear formatting"
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7V4h16v3" />
                  <path d="M9 20h6" />
                  <path d="M12 4v16" />
                  <line x1="3" y1="21" x2="21" y2="3" />
                </svg>
              }
            />
          </ToolbarGroup>

          {/* Alignment */}
          <ToolbarGroup>
            <ToolbarButton
              onClick={() => toolbar.setAlignment('left')}
              active={toolbar.elementFormat === 'left'}
              title="Align Left"
              icon={<IconAlignLeft />}
            />
            <ToolbarButton
              onClick={() => toolbar.setAlignment('center')}
              active={toolbar.elementFormat === 'center'}
              title="Align Center"
              icon={<IconAlignCenter />}
            />
            <ToolbarButton
              onClick={() => toolbar.setAlignment('right')}
              active={toolbar.elementFormat === 'right'}
              title="Align Right"
              icon={<IconAlignRight />}
            />
            <ToolbarButton
              onClick={() => toolbar.setAlignment('justify')}
              active={toolbar.elementFormat === 'justify'}
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
        </>
      )}

      {/* Find & Replace */}
      <ToolbarButton
        onClick={() => window.dispatchEvent(new CustomEvent('tei-find-replace-toggle'))}
        title="Find & Replace (Ctrl+F)"
        icon={<IconSearch />}
      />
    </div>
  );
}
