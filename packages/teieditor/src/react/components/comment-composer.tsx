'use client';

import { type FormEvent, type KeyboardEvent, useId, useMemo, useState } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { CommentComposerState } from '../../extensions/comments/index.js';
import { savedPointsRange } from '../../utils/dom-range.js';
import { useOptionalEditor } from '../context.js';
import { rangeAnchor, selectionAnchor } from '../selection-anchor.js';
import { Button } from '../ui/button.js';
import { usePartClass } from '../ui/context.js';
import { Popover } from '../ui/popover.js';
import { useSignal } from '../use-signal.js';
import {
  Avatar,
  commentsOptions,
  commentsStorage,
  currentUser,
  submitKey,
} from './comment-parts.js';

export interface CommentComposerProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/**
 * The form for a new comment, beside the text it is about: opens for
 * `addComment` (⌘⌥M, the bubble menu's Comment), posts with the button or
 * ⌘↵, and closes on Escape. The text stays painted while the form has focus.
 *
 * Render it once inside `<EditorContent>`.
 */
export function CommentComposer({ editor: editorProp }: CommentComposerProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <CommentComposer> needs an `editor` prop or a provider');
  const storage = commentsStorage(editor);
  const composer = useSignal(storage?.composer);

  if (!storage) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'teieditor: <CommentComposer> needs the Comments extension; it renders nothing.',
      );
    }
    return null;
  }
  if (!composer) return null;
  // A new composer (other text) starts a fresh form.
  return (
    <ComposerForm
      key={`${composer.anchor.key}:${composer.anchor.offset}:${composer.focus.key}:${composer.focus.offset}`}
      editor={editor}
      composer={composer}
    />
  );
}

function ComposerForm({ editor, composer }: { editor: TeiEditor; composer: CommentComposerState }) {
  const [text, setText] = useState('');
  const id = useId();
  const max = commentsOptions(editor)?.maxLength ?? 10_000;
  const tooLong = text.length > max;
  const user = currentUser(editor);
  const cls = usePartClass('input', 'tei-input tei-textarea');
  const anchor = useMemo(() => {
    const root = editor.lexical.getRootElement();
    const range = savedPointsRange(editor.lexical, composer.anchor, composer.focus);
    return range && root ? rangeAnchor(range, root) : selectionAnchor(editor);
  }, [editor, composer]);

  const close = (refocus: boolean) => {
    editor.commands.cancelComment();
    if (refocus) editor.focus();
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || tooLong) return;
    if (editor.chain().focus().submitComment(text).run()) editor.commands.toggleCommentsPanel(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
  };

  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      initialFocus="first"
      restoreFocus={false}
      onDismiss={(reason) => {
        // A press elsewhere keeps a comment half written.
        if (reason === 'escape' || !text.trim()) close(reason === 'escape');
      }}
      data-tei-control="comment-composer"
      className="tei-comment-composer"
      role="dialog"
      aria-label={editor.t('comments.add')}
    >
      <form className="tei-comment-form" noValidate onSubmit={submit}>
        <p className="tei-comment-quote" title={composer.quote}>
          {composer.quote}
        </p>
        <div className="tei-comment-byline">
          <Avatar user={user} />
          <span className="tei-comment-author">{user.name}</span>
        </div>
        <textarea
          className={cls}
          data-tei-part="input"
          rows={3}
          value={text}
          placeholder={editor.t('comments.placeholder')}
          aria-label={editor.t('comments.placeholder')}
          aria-invalid={tooLong || undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="tei-comment-actions">
          <span id={`${id}-hint`} className="tei-hint" data-error={tooLong ? '' : undefined}>
            {tooLong
              ? editor.t('comments.tooLong', { max })
              : editor.t('comments.shortcutHint', { key: submitKey(editor) })}
          </span>
          <Button size="sm" onClick={() => close(true)}>
            {editor.t('comments.cancel')}
          </Button>
          <Button type="submit" size="sm" variant="solid" disabled={!text.trim() || tooLong}>
            {editor.t('comments.submit')}
          </Button>
        </div>
      </form>
    </Popover>
  );
}
