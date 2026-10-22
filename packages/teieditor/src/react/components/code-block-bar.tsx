'use client';

import { $isCodeNode } from '@lexical/code-core';
import { $findMatchingParent } from '@lexical/utils';
import { $getNearestNodeFromDOMNode, type NodeKey } from 'lexical';
import { useEffect, useRef, useState } from 'react';
import { getExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  $getCodeBlock,
  $getCodeBlockAtSelection,
  CodeBlock,
  type CodeLanguage,
  normalizeLanguage,
} from '../../extensions/code-block/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { hoverNow } from '../hover-now.js';
import { Button } from '../ui/button.js';
import { DropdownMenu } from '../ui/dropdown.js';
import type { MenuItemData } from '../ui/menu.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';

export interface CodeBlockBarProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** The languages to offer; defaults to `CodeBlock`'s `languages`. */
  languages?: readonly CodeLanguage[];
  /** Show the copy button; defaults to `CodeBlock`'s `copyButton`. */
  copyButton?: boolean;
}

/** How long the pointer may be away before the bar goes, in ms: room to reach it. */
const LEAVE_DELAY = 150;
/** How long "Copied" shows, in ms. */
const COPIED_FOR = 1500;

/**
 * A bar in the corner of a code block: its language, which a menu changes,
 * and a copy button. It shows for the block under the pointer, or the one
 * with the caret, so it works by keyboard and touch too. Read-only editors
 * show the language as a label and keep the copy button.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function CodeBlockBar({ editor: editorProp, languages, copyButton }: CodeBlockBarProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <CodeBlockBar> needs an `editor` prop or a provider');
  const options = getExtensionOptions(editor, CodeBlock);
  const focused = useEditorFocus(editor);
  const [hovered, setHovered] = useState<NodeKey | null>(null);
  // The bar stays on its block while the pointer is on it or its menu is open.
  const [overBar, setOverBar] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const shown = useRef<NodeKey | null>(null);
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const leaveLater = useRef(() => {});

  const caret = useEditorState((e) => e.read(() => $getCodeBlockAtSelection()?.getKey() ?? null), {
    editor,
  });

  useEffect(() => {
    if (!options) return;
    const clear = () => clearTimeout(leave.current);
    const onOver = (event: PointerEvent) => {
      // A tap is not a hover; the caret it places shows the bar instead.
      if (event.pointerType === 'touch') return;
      clear();
      const target = event.target;
      const key = editor.read(() => {
        const node = target instanceof Node ? $getNearestNodeFromDOMNode(target) : null;
        const code = node && $findMatchingParent(node, $isCodeNode);
        return code ? code.getKey() : null;
      });
      setHovered(key);
    };
    const onLeave = () => {
      clear();
      leave.current = setTimeout(() => setHovered(null), LEAVE_DELAY);
    };
    leaveLater.current = onLeave;
    const off = editor.lexical.registerRootListener((root, previous) => {
      previous?.removeEventListener('pointerover', onOver);
      previous?.removeEventListener('pointerleave', onLeave);
      root?.addEventListener('pointerover', onOver);
      root?.addEventListener('pointerleave', onLeave);
      if (root) hoverNow(root, onOver);
    });
    return () => {
      clear();
      off();
    };
  }, [editor, options]);

  const key = overBar || menuOpen ? shown.current : (hovered ?? (focused ? caret : null));
  shown.current = key;
  const block = useEditorState(
    (e) =>
      key
        ? e.read(() => {
            const code = $getCodeBlock(key);
            return code
              ? {
                  key,
                  language: normalizeLanguage(code.getLanguage()),
                  id: code.getLanguage() ?? null,
                }
              : null;
          })
        : null,
    { editor },
  );
  const element = block ? editor.lexical.getElementByKey(block.key) : null;
  if (!options || !block || !element) return null;

  const list = languages ?? options.languages;
  const copy = copyButton ?? options.copyButton;

  return (
    // Its own provider, for icons, when it was given an editor outside one.
    <TeiEditorContext.Provider value={editor}>
      <Popover
        open
        anchor={element}
        placement="top-end"
        inside
        offset={6}
        variant="bar"
        dismissOnOutside={false}
        role="toolbar"
        aria-label={editor.t('code.toolbar')}
        data-tei-control="code-bar"
        onPointerEnter={() => {
          clearTimeout(leave.current);
          setOverBar(true);
        }}
        onPointerLeave={() => {
          setOverBar(false);
          // Back onto the block keeps it; anywhere else lets it go.
          leaveLater.current();
        }}
      >
        <LanguageMenu editor={editor} block={block} languages={list} onOpenChange={setMenuOpen} />
        {copy && <CopyButton editor={editor} blockKey={block.key} />}
      </Popover>
    </TeiEditorContext.Provider>
  );
}

function LanguageMenu({
  editor,
  block,
  languages,
  onOpenChange,
}: {
  editor: TeiEditor;
  block: { key: NodeKey; language: string | null; id: string | null };
  languages: readonly CodeLanguage[];
  onOpenChange: (open: boolean) => void;
}) {
  const plain = editor.t('code.plain');
  // Its own id first: Shiki has both `tsx` and `typescript`, which normalize alike.
  const current =
    languages.find(([id]) => id === block.id) ??
    languages.find(([id]) => normalizeLanguage(id) === block.language);
  // A language the list does not have still shows, by its id.
  const shown = current?.[1] ?? block.language ?? plain;
  const label = editor.t('code.language');
  if (!editor.isEditable) {
    return (
      <span className="tei-code-language" data-tei-control="code-language">
        {shown}
      </span>
    );
  }
  const choose = (language: string | null) => () =>
    editor.commands.setCodeLanguage(language, block.key);
  const items: MenuItemData[] = [
    {
      id: 'plain',
      label: plain,
      checked: block.language === null,
      radio: true,
      onSelect: choose(null),
    },
    ...languages.map(
      ([id, name]): MenuItemData => ({
        id,
        label: name,
        checked: current?.[0] === id,
        radio: true,
        onSelect: choose(id),
      }),
    ),
  ];
  return (
    <DropdownMenu
      size="sm"
      placement="bottom-end"
      label={`${label}: ${shown}`}
      aria-label={`${label}: ${shown}`}
      menuLabel={label}
      data-tei-control="code-language"
      items={items}
      onOpenChange={onOpenChange}
    >
      <span className="tei-control-label">{shown}</span>
    </DropdownMenu>
  );
}

function CopyButton({ editor, blockKey }: { editor: TeiEditor; blockKey: NodeKey }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const text = editor.read(() => $getCodeBlock(blockKey)?.getTextContent() ?? '');
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR);
  };

  const label = editor.t(copied ? 'code.copied' : 'code.copy');
  return (
    <>
      <Button
        size="sm"
        icon={copied ? 'check' : 'copy'}
        label={label}
        data-tei-control="code-copy"
        data-copied={copied ? '' : undefined}
        onClick={copy}
      />
      <span className="tei-sr-only" role="status">
        {copied ? label : ''}
      </span>
    </>
  );
}

/**
 * Put text on the clipboard: the Clipboard API, or where that is missing
 * (an insecure origin) the older copy command on a hidden field.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const previous = document.activeElement as HTMLElement | null;
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.className = 'tei-sr-only';
    document.body.append(field);
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
      previous?.focus({ preventScroll: true });
    }
  }
}
