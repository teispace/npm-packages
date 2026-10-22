'use client';

import { type ReactNode, useEffect, useId, useMemo, useRef } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { holdUi } from '../../core/ui-request.js';
import {
  getTypeahead,
  setTypeaheadHighlight,
  type TypeaheadOption,
  typeaheadRange,
} from '../../extensions/typeahead/index.js';
import { isSafeImageSrc } from '../../utils/url.js';
import { useOptionalEditor } from '../context.js';
import { rangeAnchor } from '../selection-anchor.js';
import { Icon } from '../ui/icon.js';
import { keepFocus } from '../ui/pointer.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useSignal } from '../use-signal.js';

export interface TypeaheadMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Draw a row's content your own way; the row and its behaviour stay. */
  renderOption?: (option: TypeaheadOption, state: { highlighted: boolean }) => ReactNode;
}

/**
 * The list for every typeahead the extensions add: emoji after `:`,
 * people after `@`, your own. Arrows move, Enter or Tab picks, Escape
 * closes, a tap picks. Focus stays in the document, which announces the lit
 * row through `aria-activedescendant`. Needs the Typeahead extension
 * (Emoji and Mention bring it).
 *
 * Render it inside `<EditorContent>`.
 */
export function TypeaheadMenu({ editor: editorProp, renderOption }: TypeaheadMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <TypeaheadMenu> needs an `editor` prop or a provider');
  const storage = getTypeahead(editor);
  const state = useSignal(storage?.state);
  const focused = useEditorFocus(editor);

  // While mounted, the keys are this list's.
  useEffect(() => (storage ? holdUi(storage.ui) : undefined), [storage]);

  const open = Boolean(storage && state?.visible && focused && editor.isEditable);
  const autoId = useId();
  const listId = `tei-typeahead${autoId.replace(/:/g, '')}`;
  const rowId = (index: number) => `${listId}-${index}`;
  const highlighted = state?.highlighted ?? -1;
  const count = state?.options.length ?? 0;

  // The document is the combobox: it names the list and its lit row.
  useEffect(() => {
    const root = editor.lexical.getRootElement();
    if (!root || !open) return;
    root.setAttribute('aria-controls', listId);
    root.setAttribute('aria-expanded', 'true');
    root.setAttribute('aria-autocomplete', 'list');
    if (highlighted >= 0 && highlighted < count)
      root.setAttribute('aria-activedescendant', `${listId}-${highlighted}`);
    else root.removeAttribute('aria-activedescendant');
    return () => {
      for (const name of ['aria-controls', 'aria-expanded', 'aria-autocomplete'])
        root.removeAttribute(name);
      root.removeAttribute('aria-activedescendant');
    };
  }, [editor, open, listId, highlighted, count]);

  const rows = useRef<Array<HTMLElement | null>>([]);
  useEffect(() => {
    rows.current[highlighted]?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted]);

  // Anchored to the trigger, so the list stays put as the query grows.
  const match = state?.match;
  const where = match ? `${match.key}:${match.offset}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: one place per trigger
  const anchor = useMemo(() => {
    if (!open || !match) return null;
    const range = typeaheadRange(editor.lexical, match);
    const element = editor.lexical.getElementByKey(match.key);
    return range && element ? rangeAnchor(range, element) : null;
  }, [editor, open, where]);

  if (!storage || !state || !open || !anchor) return null;
  const source = storage.sources().get(state.source);
  const label = editor.t(source?.label ?? 'typeahead.empty');

  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      onDismiss={() => editor.commands.closeTypeahead()}
      data-tei-control="typeahead"
      data-source={state.source}
    >
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        aria-busy={state.loading || undefined}
        className="tei-typeahead"
      >
        {state.options.map((option, index) => {
          const lit = index === highlighted;
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keys are the document's, through aria-activedescendant
            <div
              key={option.id}
              ref={(el) => {
                rows.current[index] = el;
              }}
              id={rowId(index)}
              role="option"
              aria-selected={lit}
              className="tei-menu-item tei-typeahead-option"
              data-highlighted={lit ? '' : undefined}
              data-id={option.id}
              onPointerDown={keepFocus}
              onPointerMove={(event) => {
                if (event.pointerType !== 'touch') setTypeaheadHighlight(storage, index);
              }}
              onClick={() => editor.chain().focus().chooseTypeahead(index).run()}
            >
              {renderOption ? (
                renderOption(option, { highlighted: lit })
              ) : (
                <OptionBody option={option} />
              )}
            </div>
          );
        })}
        {count === 0 && (
          <div className="tei-menu-empty" role="status">
            {state.loading ? (
              <>
                <Icon icon="spinner" className="tei-spin" />
                {editor.t('typeahead.loading')}
              </>
            ) : (
              editor.t(source?.empty ?? 'typeahead.empty')
            )}
          </div>
        )}
      </div>
    </Popover>
  );
}

function OptionBody({ option }: { option: TypeaheadOption }) {
  const image = option.image && isSafeImageSrc(option.image) ? option.image : null;
  return (
    <>
      {option.glyph ? (
        <span className="tei-typeahead-glyph" aria-hidden="true">
          {option.glyph}
        </span>
      ) : image ? (
        <img
          className="tei-typeahead-avatar"
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : option.icon ? (
        <Icon icon={option.icon} />
      ) : (
        <span className="tei-typeahead-avatar" aria-hidden="true">
          {option.label.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="tei-menu-item-text">
        <span className="tei-menu-item-label">{option.label}</span>
        {option.description && (
          <span className="tei-menu-item-description">{option.description}</span>
        )}
      </span>
    </>
  );
}
