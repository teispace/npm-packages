'use client';

import type { TeiEditor } from '../../core/editor.js';
import type { Suggestion } from '../../extensions/review/index.js';
import { useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';
import { useSignal } from '../use-signal.js';
import { Avatar, formatTime, reviewStorage } from './comment-parts.js';

export interface SuggestionPopoverProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

/** The run of `suggestion` the caret is in, else its first. */
function runElement(editor: TeiEditor, suggestion: Suggestion): HTMLElement | null {
  const root = editor.lexical.getRootElement();
  const node = root?.ownerDocument.getSelection()?.focusNode ?? null;
  const element = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
  const around = element?.closest<HTMLElement>('[data-tei-suggestion]');
  if (around && root?.contains(around) && around.dataset.teiSuggestion === suggestion.id)
    return around;
  const [key] = suggestion.keys;
  return key ? editor.lexical.getElementByKey(key) : null;
}

/**
 * Who suggested the change at the caret, and when, with Accept and Reject.
 * Shows while the caret is in a suggestion. Needs the Review extension.
 *
 * Render it once inside `<EditorContent>`.
 */
export function SuggestionPopover({ editor: editorProp }: SuggestionPopoverProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor)
    throw new Error('teieditor: <SuggestionPopover> needs an `editor` prop or a provider');
  const storage = reviewStorage(editor);
  const active = useSignal(storage?.active) ?? null;
  const suggestions = useSignal(storage?.suggestions);
  const focused = useEditorFocus(editor);
  const suggestion = suggestions?.find((s) => s.id === active) ?? null;
  const can = useEditorState((e) => (suggestion ? e.can().acceptChange(suggestion.id) : false), {
    editor,
  });

  if (!storage) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'teieditor: <SuggestionPopover> needs the Review extension; it renders nothing.',
      );
    }
    return null;
  }
  const anchor = suggestion && focused ? runElement(editor, suggestion) : null;
  if (!suggestion || !anchor) return null;
  const time = formatTime(editor, suggestion.createdAt);
  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      variant="bar"
      dismissOnOutside={false}
      className="tei-suggestion-bar"
      data-tei-control="suggestion"
      role="group"
      aria-label={editor.t('review.label')}
    >
      <Avatar user={suggestion.author} />
      <span className="tei-suggestion-who">
        <span className="tei-comment-author">{suggestion.author.name}</span>{' '}
        <span className="tei-suggestion-kind">
          {editor.t(suggestion.kind === 'insert' ? 'review.inserted' : 'review.deleted')}
        </span>{' '}
        <time
          className="tei-comment-time"
          dateTime={new Date(suggestion.createdAt).toISOString()}
          title={time.full}
        >
          {time.short}
        </time>
      </span>
      {can && (
        <>
          <Button
            icon="check"
            size="sm"
            label={editor.t('review.accept')}
            onClick={() => editor.chain().focus().acceptChange(suggestion.id).run()}
          />
          <Button
            icon="close"
            size="sm"
            label={editor.t('review.reject')}
            onClick={() => editor.chain().focus().rejectChange(suggestion.id).run()}
          />
        </>
      )}
    </Popover>
  );
}
