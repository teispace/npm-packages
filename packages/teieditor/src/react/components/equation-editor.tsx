'use client';

import { $getNodeByKey, type NodeKey } from 'lexical';
import { useEffect, useId, useRef, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { $caretAfter, $selectNode } from '../../core/slot-host.js';
import type { EquationStorage } from '../../extensions/equation/index.js';
import { $isEquationNode } from '../../extensions/equation/node.js';
import { type KatexLike, paintMath } from '../../extensions/equation/render.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { Switch } from '../ui/controls.js';
import { Popover } from '../ui/popover.js';
import { useEditorState } from '../use-editor-state.js';
import { useUiRequest } from '../use-ui-request.js';

/** The extension, by name: the UI never imports it. */
const EQUATION = '@teispace/teieditor/equation';

export interface EquationEditorProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/**
 * The editor an equation opens (`openEquationEditor`, a click on it, Enter
 * with it selected, a new empty one): its TeX, with a live preview and
 * KaTeX's complaint when the TeX has a mistake. Enter saves (Shift+Enter
 * for a new line), Escape cancels; an equation left empty goes.
 */
export function EquationEditor({ editor: editorProp }: EquationEditorProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <EquationEditor> needs an `editor` prop or a provider');
  return (
    <TeiEditorContext.Provider value={editor}>
      <EditorEquationEditor editor={editor} />
    </TeiEditorContext.Provider>
  );
}

const storageOf = (editor: TeiEditor) =>
  (editor.extension(EQUATION)?.output as { storage?: EquationStorage } | undefined)?.storage;

function EditorEquationEditor({ editor }: { editor: TeiEditor }) {
  const storage = storageOf(editor);
  const [key, setKey] = useState<NodeKey | null>(null);
  useUiRequest(storage?.editor, () => setKey(storage?.editFor.peek() ?? null));
  if (!key || !storage) return null;
  return (
    <EquationPopover
      key={key}
      editor={editor}
      storage={storage}
      nodeKey={key}
      onClose={() => setKey(null)}
    />
  );
}

interface Current {
  equation: string;
  inline: boolean;
  dom: HTMLElement | null;
}

/** Mounted only while open; closes itself when its equation goes (undone, deleted). */
function EquationPopover({
  editor,
  storage,
  nodeKey,
  onClose,
}: {
  editor: TeiEditor;
  storage: EquationStorage;
  nodeKey: NodeKey;
  onClose: () => void;
}) {
  const current = useEditorState(
    (e): Current | null =>
      e.read(() => {
        const node = $getNodeByKey(nodeKey);
        return $isEquationNode(node)
          ? {
              equation: node.getEquation(),
              inline: node.isInline(),
              dom: e.lexical.getElementByKey(nodeKey),
            }
          : null;
      }),
    {
      editor,
      equal: (a, b) =>
        a === b ||
        (a !== null &&
          b !== null &&
          a.equation === b.equation &&
          a.inline === b.inline &&
          a.dom === b.dom),
    },
  );
  const [value, setValue] = useState(() => current?.equation ?? '');
  const gone = current === null;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (!current?.dom) return null;
  const t = (id: string, values?: Record<string, string>) => editor.t(id, values);

  /** Out, the caret after it (or on it, from Escape), the document focused. */
  const leave = (how: 'save' | 'cancel') => {
    onClose();
    const tex = how === 'save' ? value.trim() : current.equation;
    if (how === 'save' && tex !== current.equation) editor.commands.setEquation(tex, nodeKey);
    if (!tex) {
      editor.chain().focus().removeEquation(nodeKey).run();
      return;
    }
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isEquationNode(node)) return;
      if (how === 'cancel') $selectNode(node);
      else if (node.isInline()) node.selectNext(0, 0);
      else $caretAfter(node);
    });
    editor.focus();
  };

  return (
    <Popover
      open
      anchor={current.dom}
      placement={current.inline ? 'bottom-start' : 'bottom'}
      offset={6}
      initialFocus="first"
      restoreFocus={false}
      onDismiss={(reason) => leave(reason === 'escape' ? 'cancel' : 'save')}
      role="dialog"
      aria-label={t('equation.editor')}
      data-tei-control="equation-editor"
    >
      <form
        className="tei-equation-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          leave('save');
        }}
      >
        <EquationField
          editor={editor}
          storage={storage}
          value={value}
          display={!current.inline}
          onChange={setValue}
          onSubmit={() => leave('save')}
        />
        <div className="tei-equation-actions">
          <Switch
            checked={!current.inline}
            label={t('equation.display')}
            data-tei-control="equation-display"
            onCheckedChange={(on) => editor.commands.setEquationInline(!on, nodeKey)}
          />
          <Button
            variant="danger"
            size="sm"
            icon="trash"
            label={t('equation.remove')}
            data-tei-control="equation-remove"
            onClick={() => {
              onClose();
              editor.chain().focus().removeEquation(nodeKey).run();
            }}
          />
          <Button type="submit" variant="solid" size="sm" data-tei-control="equation-done">
            {t('equation.done')}
          </Button>
        </div>
      </form>
    </Popover>
  );
}

/** The TeX, and what it makes as you type: KaTeX loads on first use. */
function EquationField({
  editor,
  storage,
  value,
  display,
  onChange,
  onSubmit,
}: {
  editor: TeiEditor;
  storage: EquationStorage;
  value: string;
  display: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const id = useId();
  const preview = useRef<HTMLDivElement>(null);
  const [katex, setKatex] = useState<KatexLike | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void storage.load().then((loaded) => {
      if (live) setKatex(loaded);
    });
    return () => {
      live = false;
    };
  }, [storage]);
  useEffect(() => {
    const el = preview.current;
    if (!el || katex === undefined) return;
    setError(paintMath(el, katex, value, display));
  }, [katex, value, display]);
  const note =
    error !== null
      ? editor.t('equation.error', { message: error })
      : katex === null
        ? editor.t('equation.noRenderer')
        : editor.t('equation.hint');
  return (
    <div className="tei-field">
      <label className="tei-label" htmlFor={id}>
        {editor.t('equation.input')}
      </label>
      <textarea
        id={id}
        className="tei-input tei-equation-input"
        data-tei-part="input"
        data-tei-control="equation-input"
        value={value}
        rows={display ? 3 : 1}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        placeholder={editor.t('equation.input.placeholder')}
        aria-describedby={`${id}-note`}
        aria-invalid={error !== null ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onSubmit();
        }}
      />
      <div
        ref={preview}
        className="tei-equation-preview"
        data-display={display ? '' : undefined}
        role="math"
        aria-label={`${editor.t('equation.preview')}: ${value}`}
        data-tei-control="equation-preview"
      />
      <span
        id={`${id}-note`}
        className="tei-hint"
        aria-live="polite"
        data-error={error !== null ? '' : undefined}
      >
        {note}
      </span>
    </div>
  );
}
