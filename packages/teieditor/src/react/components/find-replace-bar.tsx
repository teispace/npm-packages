'use client';

import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { FindReplace, type FindReplaceStorage } from '../../extensions/find-replace/index.js';
import { useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import { Popover } from '../ui/popover.js';
import { useEditorState } from '../use-editor-state.js';
import { useUiRequest } from '../use-ui-request.js';

export interface FindReplaceBarProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/** A signal's value, kept in step. */
function useSignal<T>(signal: { peek(): T; subscribe(fn: (value: T) => void): () => void }): T {
  const [value, setValue] = useState(() => signal.peek());
  useEffect(() => signal.subscribe(setValue), [signal]);
  return value;
}

const isMod = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;

/**
 * The find bar (⌘F) and its replace row (⌘⌥F): pinned to the top
 * inline-end corner of the document, like an IDE's or Google Docs'. Enter
 * and ⇧Enter step through matches, Escape closes it and selects the
 * current match, ⌥C, ⌥W and ⌥R toggle match case, whole word and regular
 * expressions. Needs the FindReplace extension.
 *
 * Render it once inside `<EditorContent>`.
 */
export function FindReplaceBar({ editor: editorProp }: FindReplaceBarProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <FindReplaceBar> needs an `editor` prop or a provider');
  const storage = editor.extension(FindReplace)?.output.storage as FindReplaceStorage | undefined;
  if (!storage) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'teieditor: <FindReplaceBar> needs the FindReplace extension; it renders nothing.',
      );
    }
    return null;
  }
  return <Bar editor={editor} storage={storage} />;
}

function Bar({ editor, storage }: { editor: TeiEditor; storage: FindReplaceStorage }) {
  const open = useSignal(storage.open);
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  // Each request focuses a field once the bar has rendered.
  const [focusAsked, setFocusAsked] = useState(0);
  useUiRequest(storage.ui, () => setFocusAsked((n) => n + 1));
  useLayoutEffect(() => {
    if (!focusAsked) return;
    const field = storage.open.peek() === 'replace' && storage.query.peek() ? replaceRef : findRef;
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  }, [focusAsked, storage]);
  if (!open) return null;
  return <OpenBar editor={editor} storage={storage} findRef={findRef} replaceRef={replaceRef} />;
}

function OpenBar({
  editor,
  storage,
  findRef,
  replaceRef,
}: {
  editor: TeiEditor;
  storage: FindReplaceStorage;
  findRef: React.RefObject<HTMLInputElement | null>;
  replaceRef: React.RefObject<HTMLInputElement | null>;
}) {
  const open = useSignal(storage.open);
  const query = useSignal(storage.query);
  const replacement = useSignal(storage.replacement);
  const options = useSignal(storage.options);
  const matches = useSignal(storage.matches);
  const current = useSignal(storage.current);
  const error = useSignal(storage.error);
  const limited = useSignal(storage.limited);
  const editable = useEditorState((e) => e.isEditable, { editor });
  const id = useId();
  const t = (key: string, values?: Record<string, string | number>) => editor.t(key, values);
  const replacing = open === 'replace' && editable;
  const count = matches.length;

  const status = !query
    ? ''
    : error
      ? t(error === 'invalid' ? 'find.invalid' : 'find.timeout')
      : count === 0
        ? t('find.none')
        : t('find.count', { current: current + 1, total: limited ? `${count}+` : count });

  const close = () => {
    editor.chain().focus().closeFind().run();
  };
  const toggle = (key: 'caseSensitive' | 'wholeWord' | 'regex') =>
    editor.commands.setFindOptions({ [key]: !storage.options.peek()[key] });

  // Keys anywhere in the bar.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    const inField = event.target instanceof HTMLInputElement;
    if (isMod(event) && !event.shiftKey && (key === 'f' || event.code === 'KeyF')) {
      event.preventDefault();
      if (event.altKey) {
        editor.commands.openReplace();
      } else {
        findRef.current?.focus();
        findRef.current?.select();
      }
    } else if ((isMod(event) && key === 'g') || event.key === 'F3') {
      event.preventDefault();
      if (event.shiftKey) editor.commands.findPrevious();
      else editor.commands.findNext();
    } else if (event.altKey && !isMod(event) && ['KeyC', 'KeyW', 'KeyR'].includes(event.code)) {
      event.preventDefault();
      toggle(
        event.code === 'KeyC' ? 'caseSensitive' : event.code === 'KeyW' ? 'wholeWord' : 'regex',
      );
    } else if (event.key === 'Enter' && inField && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (event.target === replaceRef.current) {
        if (isMod(event)) editor.commands.replaceAll();
        else editor.commands.replaceCurrent();
      } else if (event.shiftKey) editor.commands.findPrevious();
      else editor.commands.findNext();
    }
  };

  return (
    <Popover
      open
      anchor={editor.lexical.getRootElement()}
      placement="top-end"
      inside
      offset={8}
      dismissOnOutside={false}
      onDismiss={(reason) => {
        if (reason === 'escape') close();
      }}
      className="tei-find"
      data-tei-control="find-replace"
      role="search"
      aria-label={t('find.label')}
      onKeyDown={onKeyDown}
    >
      <div className="tei-find-row">
        {editable && (
          <Button
            icon={replacing ? 'chevronDown' : 'chevronRight'}
            label={t('find.toggleReplace')}
            size="sm"
            aria-expanded={replacing}
            aria-controls={`${id}-replace`}
            data-flip-rtl=""
            onClick={() => {
              if (replacing) storage.open.value = 'find';
              else editor.commands.openReplace();
            }}
          />
        )}
        <label className="tei-sr-only" htmlFor={`${id}-find`}>
          {t('find.find')}
        </label>
        <Input
          ref={findRef}
          id={`${id}-find`}
          type="text"
          value={query}
          placeholder={t('find.find')}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-invalid={error === 'invalid' || undefined}
          aria-describedby={`${id}-status`}
          onChange={(event) => editor.commands.setFindQuery(event.currentTarget.value)}
        />
        <span
          id={`${id}-status`}
          className="tei-find-status"
          role="status"
          aria-live="polite"
          data-error={error ? '' : undefined}
        >
          {status}
        </span>
        <span className="tei-find-tools">
          <Button
            icon="caseSensitive"
            label={t('find.caseSensitive')}
            shortcut="Alt+C"
            size="sm"
            pressed={options.caseSensitive}
            onClick={() => toggle('caseSensitive')}
          />
          <Button
            icon="wholeWord"
            label={t('find.wholeWord')}
            shortcut="Alt+W"
            size="sm"
            pressed={options.wholeWord}
            onClick={() => toggle('wholeWord')}
          />
          <Button
            icon="regex"
            label={t('find.regex')}
            shortcut="Alt+R"
            size="sm"
            pressed={options.regex}
            onClick={() => toggle('regex')}
          />
          <Button
            icon="arrowUp"
            label={t('find.previous')}
            shortcut="Shift+Enter"
            size="sm"
            disabled={count === 0}
            onClick={() => editor.commands.findPrevious()}
          />
          <Button
            icon="arrowDown"
            label={t('find.next')}
            shortcut="Enter"
            size="sm"
            disabled={count === 0}
            onClick={() => editor.commands.findNext()}
          />
          <Button icon="close" label={t('find.close')} shortcut="Esc" size="sm" onClick={close} />
        </span>
      </div>
      {replacing && (
        <div className="tei-find-row" id={`${id}-replace`}>
          <label className="tei-sr-only" htmlFor={`${id}-with`}>
            {t('find.replaceWith')}
          </label>
          <Input
            ref={replaceRef}
            id={`${id}-with`}
            type="text"
            value={replacement}
            placeholder={t('find.replaceWith')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => editor.commands.setFindReplacement(event.currentTarget.value)}
          />
          <span className="tei-find-tools">
            <Button
              size="sm"
              variant="outline"
              shortcut="Enter"
              label={t('find.replaceOne')}
              disabled={count === 0}
              onClick={() => editor.commands.replaceCurrent()}
            >
              {t('find.replaceOne')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              label={t('find.replaceAll')}
              shortcut={editor.shortcut('find')?.[0] === '⌘' ? '⌘Enter' : 'Ctrl+Enter'}
              disabled={count === 0}
              onClick={() => editor.commands.replaceAll()}
            >
              {t('find.replaceAll')}
            </Button>
          </span>
        </div>
      )}
    </Popover>
  );
}
