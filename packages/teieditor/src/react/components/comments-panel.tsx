'use client';

import { $getNodeByKey } from 'lexical';
import {
  type ComponentPropsWithoutRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { CommentThread, TeiComment } from '../../extensions/comments/index.js';
import type { Suggestion } from '../../extensions/review/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { cx, usePartClass } from '../ui/context.js';
import { Dialog } from '../ui/dialog.js';
import { useEditorState } from '../use-editor-state.js';
import { useSignal } from '../use-signal.js';
import {
  Avatar,
  commentsOptions,
  commentsStorage,
  formatTime,
  reviewStorage,
  submitKey,
} from './comment-parts.js';

type Filter = 'open' | 'resolved' | 'suggestions';

interface Confirming {
  threadId: string;
  /** A single comment, or the whole thread. */
  commentId?: string;
}

const NO_THREADS: readonly CommentThread[] = [];
const NO_SUGGESTIONS: readonly Suggestion[] = [];
const NO_ANCHORS: ReadonlyMap<string, readonly string[]> = new Map();

export interface CommentsPanelProps
  extends Omit<ComponentPropsWithoutRef<'aside'>, 'children' | 'title'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /**
   * `'overlay'` (default): a drawer at the page's inline end, a bottom sheet
   * on phones, shown while the panel is open (`toggleCommentsPanel`, the
   * toolbar's Comments). `'inline'`: an aside you place in your own layout,
   * always shown.
   */
  placement?: 'overlay' | 'inline';
  /** Shown at the top; default the `comments.panel` message. */
  title?: ReactNode;
}

/**
 * Every thread, with its replies: reply, resolve, reopen and delete (after
 * a confirmation); click a thread's quote to go to its text. Open and
 * resolved threads are filtered apart, and, with the Review extension, the
 * suggested changes are listed too, to accept or reject. The thread at the
 * caret is marked and scrolled into view.
 *
 * ```tsx
 * <Editor editor={editor} />
 * <CommentsPanel editor={editor} />
 * ```
 */
export function CommentsPanel({
  editor: editorProp,
  placement = 'overlay',
  title,
  className,
  ...rest
}: CommentsPanelProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <CommentsPanel> needs an `editor` prop or a provider');
  const storage = commentsStorage(editor);
  const review = reviewStorage(editor);
  const open = useSignal(storage?.panel) ?? false;
  const threads = useSignal(storage?.threads) ?? NO_THREADS;
  const anchors = useSignal(storage?.anchors) ?? NO_ANCHORS;
  const active = useSignal(storage?.active) ?? null;
  const suggestions = useSignal(review?.suggestions) ?? NO_SUGGESTIONS;
  const activeSuggestion = useSignal(review?.active) ?? null;
  const [filter, setFilter] = useState<Filter>('open');
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  const overlay = placement === 'overlay';
  const shown = !overlay || open;

  // The active thread's list shows, and the thread scrolls into view.
  const activeResolved = threads.find((thread) => thread.id === active)?.resolved;
  useEffect(() => {
    if (activeResolved !== undefined) setFilter(activeResolved ? 'resolved' : 'open');
  }, [activeResolved]);
  useEffect(() => {
    if (activeSuggestion) setFilter('suggestions');
  }, [activeSuggestion]);
  useEffect(() => {
    const key = active ?? activeSuggestion;
    if (!key || !shown) return;
    const item = ref.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(key)}"]`);
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [active, activeSuggestion, shown]);

  // An overlay goes into the top layer, so nothing clips it.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!overlay || !node || typeof node.showPopover !== 'function') return;
    if (open && !node.matches?.(':popover-open')) node.showPopover();
    if (!open && node.hasAttribute('data-shim-popover-open')) node.hidePopover();
    return () => {
      try {
        if (node.matches(':popover-open')) node.hidePopover();
      } catch {
        // No :popover-open support (jsdom): nothing to hide.
      }
    };
  }, [overlay, open]);

  const ordered = useMemo(() => orderThreads(editor, threads, anchors), [editor, threads, anchors]);

  if (!storage) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('teieditor: <CommentsPanel> needs the Comments extension; it renders nothing.');
    }
    return null;
  }

  const visible = ordered.filter((thread) => thread.resolved === (filter === 'resolved'));
  const close = () => {
    editor.commands.toggleCommentsPanel(false);
    editor.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !overlay || event.defaultPrevented) return;
    event.preventDefault();
    close();
  };
  const label = title ?? editor.t('comments.panel');
  const filters: Filter[] = review ? ['open', 'resolved', 'suggestions'] : ['open', 'resolved'];
  const counts: Record<Filter, number> = {
    open: ordered.filter((t) => !t.resolved).length,
    resolved: ordered.filter((t) => t.resolved).length,
    suggestions: suggestions.length,
  };

  return (
    <TeiEditorContext.Provider value={editor}>
      <aside
        {...rest}
        ref={ref}
        className={cx('tei-portal', 'tei-comments-panel', className)}
        aria-labelledby={`${id}-title`}
        data-placement={placement}
        data-tei-ui={overlay ? '' : undefined}
        data-open={shown ? '' : undefined}
        popover={overlay ? 'manual' : undefined}
        hidden={!shown || undefined}
        onKeyDown={onKeyDown}
      >
        <header className="tei-comments-header">
          <h2 className="tei-comments-title" id={`${id}-title`}>
            {label}
          </h2>
          {overlay && (
            <Button icon="close" size="sm" label={editor.t('comments.close')} onClick={close} />
          )}
        </header>
        <fieldset className="tei-comments-filter">
          <legend className="tei-sr-only">{editor.t('comments.filter')}</legend>
          {filters.map((value) => (
            <Button
              key={value}
              size="sm"
              pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {editor.t(
                value === 'open'
                  ? 'comments.open'
                  : value === 'resolved'
                    ? 'comments.resolved'
                    : 'review.title',
              )}
              <span className="tei-comments-count">{counts[value]}</span>
            </Button>
          ))}
        </fieldset>
        {filter === 'suggestions' ? (
          <SuggestionList editor={editor} suggestions={suggestions} active={activeSuggestion} />
        ) : visible.length === 0 ? (
          <p className="tei-comments-empty">
            {editor.t(filter === 'resolved' ? 'comments.emptyResolved' : 'comments.empty')}
          </p>
        ) : (
          <ol className="tei-thread-list">
            {visible.map((thread) => (
              <Thread
                key={thread.id}
                editor={editor}
                thread={thread}
                active={thread.id === active}
                detached={!anchors.has(thread.id)}
                onDelete={(commentId) => setConfirming({ threadId: thread.id, commentId })}
              />
            ))}
          </ol>
        )}
        <Dialog
          open={confirming !== null}
          onOpenChange={(value) => {
            if (!value) setConfirming(null);
          }}
          title={editor.t(
            confirming?.commentId ? 'comments.deleteComment' : 'comments.deleteThread',
          )}
          description={editor.t(
            confirming?.commentId ? 'comments.confirmComment' : 'comments.confirmThread',
          )}
          closeLabel={editor.t('comments.cancel')}
          footer={
            <>
              <Button onClick={() => setConfirming(null)}>{editor.t('comments.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirming?.commentId)
                    editor.commands.deleteComment(confirming.threadId, confirming.commentId);
                  else if (confirming) editor.commands.deleteThread(confirming.threadId);
                  setConfirming(null);
                }}
              >
                {editor.t('comments.delete')}
              </Button>
            </>
          }
        />
      </aside>
    </TeiEditorContext.Provider>
  );
}

/** Threads in the order of their text in the document; detached ones last, oldest first. */
function orderThreads(
  editor: TeiEditor,
  threads: readonly CommentThread[],
  anchors: ReadonlyMap<string, readonly string[]>,
): CommentThread[] {
  const first = new Map<string, HTMLElement>();
  for (const thread of threads) {
    const elements = (anchors.get(thread.id) ?? []).flatMap(
      (key) => editor.lexical.getElementByKey(key) ?? [],
    );
    const top = elements.reduce<HTMLElement | null>(
      (best, el) =>
        !best || best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING ? el : best,
      null,
    );
    if (top) first.set(thread.id, top);
  }
  return [...threads].sort((a, b) => {
    const x = first.get(a.id);
    const y = first.get(b.id);
    if (x && y && x !== y)
      return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    if (x && !y) return -1;
    if (!x && y) return 1;
    return a.createdAt - b.createdAt;
  });
}

function Thread({
  editor,
  thread,
  active,
  detached,
  onDelete,
}: {
  editor: TeiEditor;
  thread: CommentThread;
  active: boolean;
  detached: boolean;
  onDelete: (commentId?: string) => void;
}) {
  const can = useEditorState(
    (e) => ({
      resolve: e.can().resolveThread(thread.id),
      reopen: e.can().reopenThread(thread.id),
      deleteThread: e.can().deleteThread(thread.id),
      deletable: thread.comments.map((c) => e.can().deleteComment(thread.id, c.id)).join(),
    }),
    { editor },
  );
  const deletable = can.deletable.split(',');
  return (
    <li
      className="tei-thread"
      data-id={thread.id}
      data-active={active ? '' : undefined}
      data-resolved={thread.resolved ? '' : undefined}
    >
      <button
        type="button"
        className="tei-thread-quote"
        aria-current={active || undefined}
        onClick={() => editor.commands.focusThread(thread.id)}
      >
        {thread.quote || ' '}
      </button>
      {detached && <p className="tei-hint">{editor.t('comments.detached')}</p>}
      <ol className="tei-thread-comments">
        {thread.comments.map((comment, i) => (
          <CommentItem
            key={comment.id}
            editor={editor}
            comment={comment}
            onDelete={deletable[i] === 'true' ? () => onDelete(comment.id) : undefined}
          />
        ))}
      </ol>
      {!thread.resolved && <ReplyForm editor={editor} threadId={thread.id} />}
      <div className="tei-thread-actions">
        {can.resolve && (
          <Button size="sm" icon="check" onClick={() => editor.commands.resolveThread(thread.id)}>
            {editor.t('comments.resolve')}
          </Button>
        )}
        {can.reopen && (
          <Button size="sm" onClick={() => editor.commands.reopenThread(thread.id)}>
            {editor.t('comments.reopen')}
          </Button>
        )}
        {can.deleteThread && (
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            label={editor.t('comments.deleteThread')}
            onClick={() => onDelete()}
          />
        )}
      </div>
    </li>
  );
}

function CommentItem({
  editor,
  comment,
  onDelete,
}: {
  editor: TeiEditor;
  comment: TeiComment;
  onDelete?: () => void;
}) {
  const time = formatTime(editor, comment.createdAt);
  return (
    <li className="tei-comment-item">
      <div className="tei-comment-byline">
        <Avatar user={comment.author} />
        <span className="tei-comment-author">{comment.author.name}</span>
        <time
          className="tei-comment-time"
          dateTime={new Date(comment.createdAt).toISOString()}
          title={time.full}
        >
          {time.short}
        </time>
        {onDelete && (
          <Button
            size="sm"
            icon="trash"
            label={editor.t('comments.deleteComment')}
            className="tei-comment-delete"
            onClick={onDelete}
          />
        )}
      </div>
      <p className="tei-comment-content">{comment.content}</p>
    </li>
  );
}

function ReplyForm({ editor, threadId }: { editor: TeiEditor; threadId: string }) {
  const [text, setText] = useState('');
  const cls = usePartClass('input', 'tei-input tei-textarea');
  const max = commentsOptions(editor)?.maxLength ?? 10_000;
  const valid = text.trim() !== '' && text.length <= max;
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (valid && editor.commands.replyToThread(threadId, text)) setText('');
  };
  return (
    <form className="tei-comment-reply" noValidate onSubmit={submit}>
      <textarea
        className={cls}
        data-tei-part="input"
        rows={1}
        value={text}
        placeholder={editor.t('comments.replyPlaceholder')}
        aria-label={editor.t('comments.replyPlaceholder')}
        title={editor.t('comments.shortcutHint', { key: submitKey(editor) })}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
        }}
      />
      {text && (
        <Button type="submit" size="sm" variant="solid" disabled={!valid}>
          {editor.t('comments.reply')}
        </Button>
      )}
    </form>
  );
}

/** A suggestion's text as the list shows it: line breaks as ⏎, a bare break by name. */
const shown = (editor: TeiEditor, text: string) =>
  text.trim() === '' && text.includes('\n')
    ? editor.t('review.lineBreak')
    : text.replace(/\n/g, ' ⏎ ');

function SuggestionList({
  editor,
  suggestions,
  active,
}: {
  editor: TeiEditor;
  suggestions: readonly Suggestion[];
  active: string | null;
}) {
  const can = useEditorState(
    (e) => ({
      all: e.can().acceptAllChanges(),
      each: suggestions.map((s) => e.can().acceptChange(s.id)).join(),
    }),
    { editor },
  );
  const allowed = can.each.split(',');
  if (suggestions.length === 0)
    return <p className="tei-comments-empty">{editor.t('review.empty')}</p>;
  const reveal = (suggestion: Suggestion) => {
    const key = suggestion.keys[0];
    if (!key) return;
    editor.update(() => $getNodeByKey(key)?.selectStart());
    editor.focus();
    editor.lexical.getElementByKey(key)?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
  };
  return (
    <>
      {can.all && (
        <div className="tei-thread-actions" data-all="">
          <Button size="sm" icon="check" onClick={() => editor.commands.acceptAllChanges()}>
            {editor.t('review.acceptAll')}
          </Button>
          <Button size="sm" icon="close" onClick={() => editor.commands.rejectAllChanges()}>
            {editor.t('review.rejectAll')}
          </Button>
        </div>
      )}
      <ol className="tei-thread-list">
        {suggestions.map((suggestion, i) => {
          const time = formatTime(editor, suggestion.createdAt);
          return (
            <li
              key={suggestion.id}
              className="tei-thread"
              data-id={suggestion.id}
              data-kind={suggestion.kind}
              data-active={suggestion.id === active ? '' : undefined}
            >
              <div className="tei-comment-byline">
                <Avatar user={suggestion.author} />
                <span className="tei-comment-author">{suggestion.author.name}</span>
                <time
                  className="tei-comment-time"
                  dateTime={new Date(suggestion.createdAt).toISOString()}
                  title={time.full}
                >
                  {time.short}
                </time>
              </div>
              <button
                type="button"
                className="tei-thread-quote tei-suggestion-quote"
                aria-current={suggestion.id === active || undefined}
                onClick={() => reveal(suggestion)}
              >
                <span className="tei-suggestion-kind">
                  {editor.t(suggestion.kind === 'insert' ? 'review.inserted' : 'review.deleted')}
                </span>{' '}
                {suggestion.kind === 'insert' ? (
                  <ins>{shown(editor, suggestion.text)}</ins>
                ) : (
                  <del>{shown(editor, suggestion.text)}</del>
                )}
              </button>
              {allowed[i] === 'true' && (
                <div className="tei-thread-actions">
                  <Button
                    size="sm"
                    icon="check"
                    onClick={() => editor.commands.acceptChange(suggestion.id)}
                  >
                    {editor.t('review.accept')}
                  </Button>
                  <Button
                    size="sm"
                    icon="close"
                    onClick={() => editor.commands.rejectChange(suggestion.id)}
                  >
                    {editor.t('review.reject')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
