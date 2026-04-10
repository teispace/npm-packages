'use client';

import { $createCodeNode, $isCodeNode } from '@lexical/code';
import { $toggleLink } from '@lexical/link';
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
} from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createHeadingNode, $isHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $findMatchingParent, $getNearestNodeOfType } from '@lexical/utils';
import { setBackgroundColor, setTextColor } from '@teispace/teieditor/extensions/color';
import { setFontFamily } from '@teispace/teieditor/extensions/font-family';
import { setFontSize } from '@teispace/teieditor/extensions/font-size';
import {
  $createParagraphNode,
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
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'bullet'
  | 'number'
  | 'check'
  | 'code'
  | 'quote';

const BLOCK_LABELS: Record<BlockType, string> = {
  paragraph: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  bullet: 'Bullet List',
  number: 'Numbered List',
  check: 'Checklist',
  code: 'Code Block',
  quote: 'Quote',
};

// ---------------------------------------------------------------------------
// Small reusable components
// ---------------------------------------------------------------------------

function ToolbarButton({
  onClick,
  disabled,
  active,
  title,
  children,
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`tei-toolbar-btn inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40 ${
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
      } ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="tei-toolbar-separator mx-1 h-6 w-px bg-border" />;
}

function ToolbarSelect({
  value,
  onChange,
  options,
  title,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  title: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`tei-toolbar-select h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none hover:bg-accent ${className}`}
      title={title}
      aria-label={title}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Color Picker Popover (simple inline)
// ---------------------------------------------------------------------------

const PALETTE = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#b7b7b7',
  '#cccccc',
  '#d9d9d9',
  '#efefef',
  '#f3f3f3',
  '#ffffff',
  '#980000',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#0000ff',
  '#9900ff',
  '#ff00ff',
  '#e6b8af',
  '#f4cccc',
  '#fce5cd',
  '#fff2cc',
  '#d9ead3',
  '#d0e0e3',
  '#c9daf8',
  '#cfe2f3',
  '#d9d2e9',
  '#ead1dc',
];

function ColorPicker({
  onSelect,
  onClose,
}: {
  onSelect: (color: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="tei-color-picker absolute top-full left-0 z-50 mt-1 grid grid-cols-10 gap-0.5 rounded-lg border border-border bg-popover p-2 shadow-md"
    >
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className="h-5 w-5 rounded-sm border border-border/50 hover:scale-110 transition-transform"
          style={{ backgroundColor: color }}
          onClick={() => {
            onSelect(color);
            onClose();
          }}
          title={color}
          aria-label={`Color ${color}`}
        />
      ))}
      <button
        type="button"
        className="col-span-10 mt-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
        onClick={() => {
          onSelect('');
          onClose();
        }}
      >
        Clear
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export interface ToolbarProps {
  className?: string;
}

/**
 * Full-featured toolbar with formatting, blocks, lists, links, alignment,
 * fonts, and colors. Copied to your project — customize freely.
 */
export function Toolbar({ className = '' }: ToolbarProps) {
  const [editor] = useLexicalComposerContext();

  // -- State ----------------------------------------------------------------
  const [activeFormats, setActiveFormats] = useState<Set<TextFormatType>>(new Set());
  const [blockType, setBlockType] = useState<BlockType>('paragraph');
  const [elementFormat, setElementFormat] = useState<ElementFormatType>('left');
  const [fontSize, setFontSizeState] = useState('16px');
  const [fontFamily, setFontFamilyState] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showBgColor, setShowBgColor] = useState(false);

  // -- Sync toolbar state with editor selection ----------------------------
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

        // Font styles from selection
        const fsValue = selection.style?.match(/font-size:\s*([^;]+)/)?.[1] || '16px';
        setFontSizeState(fsValue);
        const ffValue = selection.style?.match(/font-family:\s*([^;]+)/)?.[1] || '';
        setFontFamilyState(ffValue);

        // Block type detection
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
        } else {
          const type = $isHeadingNode(element)
            ? element.getTag()
            : $isCodeNode(element)
              ? 'code'
              : element.getType() === 'quote'
                ? 'quote'
                : 'paragraph';
          setBlockType(type as BlockType);
        }

        // Element format
        if ('getFormatType' in element && typeof element.getFormatType === 'function') {
          setElementFormat((element.getFormatType() as ElementFormatType) || 'left');
        }
      });
    });
  }, [editor]);

  // Undo/Redo state
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

  // -- Handlers -------------------------------------------------------------
  const toggleFormat = useCallback(
    (f: TextFormatType) => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, f);
    },
    [editor],
  );

  const handleBlockType = useCallback(
    (type: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        switch (type) {
          case 'paragraph':
            $setBlocksType(selection, () => $createParagraphNode());
            break;
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
            $setBlocksType(selection, () => $createHeadingNode(type as HeadingTagType));
            break;
          case 'code':
            $setBlocksType(selection, () => $createCodeNode());
            break;
          case 'bullet':
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            return;
          case 'number':
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            return;
          case 'check':
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
            return;
        }
      });
    },
    [editor],
  );

  const handleInsertLink = useCallback(() => {
    const url = typeof window !== 'undefined' ? window.prompt('Enter URL:') : null;
    if (url) {
      editor.update(() => {
        $toggleLink(url);
      });
    }
  }, [editor]);

  // -- Render ---------------------------------------------------------------
  return (
    <div
      className={`tei-toolbar flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5 ${className}`.trim()}
      role="toolbar"
      aria-label="Editor toolbar"
    >
      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <span className="text-xs" aria-hidden>
          &#x21A9;
        </span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        <span className="text-xs" aria-hidden>
          &#x21AA;
        </span>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Block type */}
      <ToolbarSelect
        value={blockType}
        onChange={handleBlockType}
        options={Object.entries(BLOCK_LABELS).map(([value, label]) => ({ value, label }))}
        title="Block type"
        className="w-[130px]"
      />

      <ToolbarSeparator />

      {/* Font family */}
      <ToolbarSelect
        value={fontFamily}
        onChange={(v) => {
          setFontFamily(editor, v);
          setFontFamilyState(v);
        }}
        options={[
          { label: 'Default', value: '' },
          { label: 'Arial', value: 'Arial, sans-serif' },
          { label: 'Courier New', value: '"Courier New", monospace' },
          { label: 'Georgia', value: 'Georgia, serif' },
          { label: 'Times New Roman', value: '"Times New Roman", serif' },
          { label: 'Verdana', value: 'Verdana, sans-serif' },
        ]}
        title="Font family"
        className="w-[120px] hidden sm:inline-flex"
      />

      {/* Font size */}
      <ToolbarSelect
        value={fontSize}
        onChange={(v) => {
          setFontSize(editor, v);
          setFontSizeState(v);
        }}
        options={[
          '12px',
          '14px',
          '16px',
          '18px',
          '20px',
          '24px',
          '28px',
          '32px',
          '36px',
          '48px',
          '64px',
        ].map((s) => ({ label: s, value: s }))}
        title="Font size"
        className="w-[72px] hidden sm:inline-flex"
      />

      <ToolbarSeparator />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => toggleFormat('bold')}
        active={activeFormats.has('bold')}
        title="Bold (Ctrl+B)"
      >
        <span className="text-xs font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleFormat('italic')}
        active={activeFormats.has('italic')}
        title="Italic (Ctrl+I)"
      >
        <span className="text-xs italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleFormat('underline')}
        active={activeFormats.has('underline')}
        title="Underline (Ctrl+U)"
      >
        <span className="text-xs underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleFormat('strikethrough')}
        active={activeFormats.has('strikethrough')}
        title="Strikethrough"
      >
        <span className="text-xs line-through">S</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleFormat('code')}
        active={activeFormats.has('code')}
        title="Code (Ctrl+E)"
      >
        <span className="text-xs font-mono">&lt;&gt;</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleFormat('highlight')}
        active={activeFormats.has('highlight')}
        title="Highlight"
      >
        <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">H</span>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Colors */}
      <div className="relative">
        <ToolbarButton
          onClick={() => {
            setShowTextColor(!showTextColor);
            setShowBgColor(false);
          }}
          title="Text color"
        >
          <span className="text-xs">
            A<span className="block h-0.5 w-full bg-current" />
          </span>
        </ToolbarButton>
        {showTextColor && (
          <ColorPicker
            onSelect={(c) => setTextColor(editor, c)}
            onClose={() => setShowTextColor(false)}
          />
        )}
      </div>
      <div className="relative">
        <ToolbarButton
          onClick={() => {
            setShowBgColor(!showBgColor);
            setShowTextColor(false);
          }}
          title="Background color"
        >
          <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-1 rounded">A</span>
        </ToolbarButton>
        {showBgColor && (
          <ColorPicker
            onSelect={(c) => setBackgroundColor(editor, c)}
            onClose={() => setShowBgColor(false)}
          />
        )}
      </div>

      <ToolbarSeparator />

      {/* Link */}
      <ToolbarButton onClick={handleInsertLink} title="Insert link (Ctrl+K)">
        <span className="text-xs">🔗</span>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}
        active={elementFormat === 'left'}
        title="Align left"
      >
        <span className="text-xs">≡</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}
        active={elementFormat === 'center'}
        title="Align center"
      >
        <span className="text-xs">≡</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}
        active={elementFormat === 'right'}
        title="Align right"
      >
        <span className="text-xs">≡</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')}
        active={elementFormat === 'justify'}
        title="Justify"
      >
        <span className="text-xs">≡</span>
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Indent */}
      <ToolbarButton
        onClick={() => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)}
        title="Indent (Tab)"
      >
        <span className="text-xs">→|</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)}
        title="Outdent (Shift+Tab)"
      >
        <span className="text-xs">|←</span>
      </ToolbarButton>
    </div>
  );
}
