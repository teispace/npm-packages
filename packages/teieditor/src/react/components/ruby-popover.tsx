'use client';

import { type FormEvent, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import { $getRubyAtSelection, Ruby, type RubyStorage } from '../../extensions/ruby/index.js';
import { useOptionalEditor } from '../context.js';
import { selectionAnchor } from '../selection-anchor.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import type { FloatingAnchor } from '../ui/floating.js';
import { Popover } from '../ui/popover.js';
import { useUiRequest } from '../use-ui-request.js';

export interface RubyPopoverProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

interface Editing {
  anchor: FloatingAnchor;
  /** The annotation there now, or `null` for new text. */
  annotation: string | null;
  id: number;
}

/**
 * Add, edit and remove ruby annotations. Opens for `openRubyEditor` (the
 * toolbar's and bubble menu's ruby buttons) and for a click on a reading.
 *
 * Render it once inside `<EditorContent>`.
 */
export function RubyPopover({ editor: editorProp }: RubyPopoverProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <RubyPopover> needs an `editor` prop or a provider');
  const storage = editor.extension(Ruby)?.output.storage as RubyStorage | undefined;
  const [editing, setEditing] = useState<Editing>();

  useUiRequest(storage?.edit, () => {
    const current = editor.read(() => {
      const ruby = $getRubyAtSelection();
      return ruby ? { key: ruby.getKey(), annotation: ruby.getAnnotation() } : null;
    });
    const element = current ? editor.lexical.getElementByKey(current.key) : null;
    const anchor = element ?? selectionAnchor(editor);
    if (anchor)
      setEditing((prev) => ({
        anchor,
        annotation: current?.annotation ?? null,
        id: (prev?.id ?? 0) + 1,
      }));
  });

  if (!storage) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('teieditor: <RubyPopover> needs the Ruby extension; it renders nothing.');
    }
    return null;
  }
  if (!editing) return null;
  return (
    <RubyForm
      // A new request starts a fresh form.
      key={editing.id}
      editor={editor}
      editing={editing}
      onClose={(refocus = true) => {
        setEditing(undefined);
        if (refocus) editor.focus();
      }}
    />
  );
}

function RubyForm({
  editor,
  editing,
  onClose,
}: {
  editor: TeiEditor;
  editing: Editing;
  onClose: (refocus?: boolean) => void;
}) {
  const [value, setValue] = useState(editing.annotation ?? '');
  const existing = editing.annotation !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (text) editor.chain().focus().setRuby(text).run();
    else if (existing) editor.chain().focus().unsetRuby().run();
    onClose();
  };

  return (
    <Popover
      open
      anchor={editing.anchor}
      placement="top-start"
      initialFocus="first"
      restoreFocus={false}
      onDismiss={(reason) => onClose(reason === 'escape')}
      data-tei-control="ruby-editor"
      role="dialog"
      aria-label={editor.t(existing ? 'ruby.edit' : 'ruby.add')}
    >
      <form className="tei-link-form" noValidate onSubmit={submit}>
        <Input
          value={value}
          placeholder={editor.t('ruby.placeholder')}
          aria-label={editor.t('ruby.placeholder')}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" variant="solid" size="sm">
          {editor.t('ruby.apply')}
        </Button>
        {existing && (
          <Button
            icon="trash"
            label={editor.t('ruby.remove')}
            size="sm"
            onClick={() => {
              editor.chain().focus().unsetRuby().run();
              onClose();
            }}
          />
        )}
      </form>
    </Popover>
  );
}
