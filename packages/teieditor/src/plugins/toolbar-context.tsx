'use client';

import { $isCodeNode, CODE_LANGUAGE_MAP } from '@lexical/code';
import { $isListNode, ListNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isHeadingNode } from '@lexical/rich-text';
import { $getSelectionStyleValueForProperty, $patchStyleText } from '@lexical/selection';
import { $findMatchingParent, $getNearestNodeOfType } from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  type TextFormatType,
} from 'lexical';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolbarState {
  /** Current block type: paragraph, h1-h6, bullet, number, check, code, quote */
  blockType: string;
  /** Active text formats */
  activeFormats: Set<TextFormatType>;
  /** Element alignment */
  elementFormat: ElementFormatType;
  /** Can undo */
  canUndo: boolean;
  /** Can redo */
  canRedo: boolean;
  /** Whether cursor is on a link */
  isLink: boolean;
  /** Current font family */
  fontFamily: string;
  /** Current font size (e.g. "15px") */
  fontSize: string;
  /** Current font color */
  fontColor: string;
  /** Current background color */
  bgColor: string;
  /** Code block language */
  codeLanguage: string;
  /** Root type (root or table) */
  rootType: string;
  /** Whether selection is inside image caption */
  isImageCaption: boolean;
  /** The active Lexical editor (may be nested e.g. in image caption) */
  activeEditor: LexicalEditor;
}

export interface ToolbarActions {
  /** Toggle a text format */
  toggleFormat: (format: TextFormatType) => void;
  /** Set element alignment */
  setAlignment: (format: ElementFormatType) => void;
  /** Apply font family */
  applyFontFamily: (family: string) => void;
  /** Apply font size */
  applyFontSize: (size: string) => void;
  /** Apply font color */
  applyFontColor: (color: string) => void;
  /** Apply background color */
  applyBgColor: (color: string) => void;
  /** Clear all formatting */
  clearFormatting: () => void;
}

export type ToolbarContextValue = ToolbarState & ToolbarActions;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_FONT_SIZE = '15px';
const DEFAULT_FONT_FAMILY = 'Arial';
const DEFAULT_FONT_COLOR = '#000000';
const DEFAULT_BG_COLOR = '#ffffff';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

/**
 * Access toolbar state and actions from any child component.
 */
export function useToolbarState(): ToolbarContextValue {
  const ctx = useContext(ToolbarContext);
  if (!ctx) {
    throw new Error('useToolbarState must be used within <ToolbarProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ToolbarProviderProps {
  children: ReactNode;
}

/**
 * Provides shared toolbar state derived from the Lexical editor's selection.
 * Must be rendered inside `<LexicalComposer>`.
 */
export function ToolbarProvider({ children }: ToolbarProviderProps) {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState<LexicalEditor>(editor);

  // State
  const [blockType, setBlockType] = useState<string>('paragraph');
  const [activeFormats, setActiveFormats] = useState<Set<TextFormatType>>(new Set());
  const [elementFormat, setElementFormat] = useState<ElementFormatType>('left');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [fontFamily, setFontFamily] = useState(DEFAULT_FONT_FAMILY);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [fontColor, setFontColor] = useState(DEFAULT_FONT_COLOR);
  const [bgColor, setBgColor] = useState(DEFAULT_BG_COLOR);
  const [codeLanguage, setCodeLanguage] = useState('javascript');
  const [rootType, setRootType] = useState<string>('root');
  const [isImageCaption] = useState(false);

  // Core function that reads selection and updates all toolbar state
  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    // Text formats
    const formats = new Set<TextFormatType>();
    const formatTypes: TextFormatType[] = [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'code',
      'highlight',
      'subscript',
      'superscript',
    ];
    for (const f of formatTypes) {
      if (selection.hasFormat(f)) formats.add(f);
    }
    setActiveFormats(formats);

    // Style properties
    setFontFamily(
      $getSelectionStyleValueForProperty(selection, 'font-family', DEFAULT_FONT_FAMILY),
    );
    setFontSize($getSelectionStyleValueForProperty(selection, 'font-size', DEFAULT_FONT_SIZE));
    setFontColor($getSelectionStyleValueForProperty(selection, 'color', DEFAULT_FONT_COLOR));
    setBgColor($getSelectionStyleValueForProperty(selection, 'background-color', DEFAULT_BG_COLOR));

    // Block type
    const anchorNode = selection.anchor.getNode();
    const element =
      anchorNode.getKey() === 'root'
        ? anchorNode
        : ($findMatchingParent(anchorNode, (e) => {
            const parent = e.getParent();
            return parent !== null && $isRootOrShadowRoot(parent);
          }) ?? anchorNode.getTopLevelElementOrThrow());

    // Root type
    const elementParent = element.getParent();
    if (elementParent !== null) {
      setRootType(elementParent.getType());
    } else {
      setRootType('root');
    }

    if ($isListNode(element)) {
      const parentList = $getNearestNodeOfType(anchorNode, ListNode);
      const type = parentList ? parentList.getListType() : element.getListType();
      setBlockType(type === 'number' ? 'number' : type === 'check' ? 'check' : 'bullet');
    } else if ($isHeadingNode(element)) {
      setBlockType(element.getTag());
    } else if ($isCodeNode(element)) {
      setBlockType('code');
      const lang = element.getLanguage();
      setCodeLanguage(lang ? CODE_LANGUAGE_MAP[lang] || lang : 'javascript');
    } else if (element.getType() === 'quote') {
      setBlockType('quote');
    } else {
      setBlockType('paragraph');
    }

    // Element format (alignment)
    if ('getFormatType' in element && typeof element.getFormatType === 'function') {
      setElementFormat((element.getFormatType() as ElementFormatType) || 'left');
    }

    // Link detection
    const node = selection.anchor.getNode();
    const parent = node.getParent();
    setIsLink((parent !== null && parent.getType() === 'link') || node.getType() === 'link');
  }, []);

  // Register selection change listener (highest priority to get first notification)
  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        setActiveEditor(newEditor);
        $updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, $updateToolbar]);

  // Register update listener for content changes
  useEffect(() => {
    return activeEditor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        $updateToolbar();
      });
    });
  }, [activeEditor, $updateToolbar]);

  // Undo/redo
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

  // Actions
  const toggleFormat = useCallback(
    (format: TextFormatType) => {
      activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [activeEditor],
  );

  const setAlignment = useCallback(
    (format: ElementFormatType) => {
      activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
    },
    [activeEditor],
  );

  const applyFontFamily = useCallback(
    (family: string) => {
      activeEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { 'font-family': family });
        }
      });
    },
    [activeEditor],
  );

  const applyFontSize = useCallback(
    (size: string) => {
      activeEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { 'font-size': size });
        }
      });
    },
    [activeEditor],
  );

  const applyFontColor = useCallback(
    (color: string) => {
      activeEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { color });
        }
      });
    },
    [activeEditor],
  );

  const applyBgColor = useCallback(
    (color: string) => {
      activeEditor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { 'background-color': color });
        }
      });
    },
    [activeEditor],
  );

  const clearFormatting = useCallback(() => {
    activeEditor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor;
        const focus = selection.focus;
        const nodes = selection.getNodes();

        if (anchor.key === focus.key && anchor.offset === focus.offset) return;

        for (const node of nodes) {
          if (node.getType() === 'text') {
            const textNode = node;
            if ('setFormat' in textNode && typeof textNode.setFormat === 'function') {
              (textNode as any).setFormat(0);
            }
            if ('setStyle' in textNode && typeof textNode.setStyle === 'function') {
              (textNode as any).setStyle('');
            }
          }
        }
      }
    });
  }, [activeEditor]);

  const value: ToolbarContextValue = {
    blockType,
    activeFormats,
    elementFormat,
    canUndo,
    canRedo,
    isLink,
    fontFamily,
    fontSize,
    fontColor,
    bgColor,
    codeLanguage,
    rootType,
    isImageCaption,
    activeEditor,
    toggleFormat,
    setAlignment,
    applyFontFamily,
    applyFontSize,
    applyFontColor,
    applyBgColor,
    clearFormatting,
  };

  return <ToolbarContext.Provider value={value}>{children}</ToolbarContext.Provider>;
}
