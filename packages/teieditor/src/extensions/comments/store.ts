/** Who wrote a comment. `color` tints their avatar; it is never put into a style attribute. */
export interface CommentUser {
  id: string;
  name: string;
  color?: string;
}

export interface TeiComment {
  id: string;
  author: CommentUser;
  /** Plain text. Never HTML: the UI shows it as text. */
  content: string;
  /** Milliseconds since the epoch. */
  createdAt: number;
}

/**
 * A thread: the text it is about (`quote`, as it was when it began) and
 * its comments, oldest first. Its anchors live in the document as mark
 * ids, so they move with the text; the store holds only the talk.
 */
export interface CommentThread {
  id: string;
  quote: string;
  comments: readonly TeiComment[];
  resolved: boolean;
  createdAt: number;
}

/**
 * Where threads live. The in-memory store is the default; an app keeps
 * them on its server (or in a Yjs map) with its own. Writes may return a
 * promise: the editor does not wait for it, so a remote store should
 * update what `getThreads` returns at once (optimistically) and tell its
 * subscribers, then persist. A rejected write goes to `onError`.
 */
export interface CommentStore {
  /** The threads, oldest first. The same array until something changes. */
  getThreads(): readonly CommentThread[];
  /** Called after every change, local or remote. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  addThread(thread: CommentThread): void | Promise<void>;
  addComment(threadId: string, comment: TeiComment): void | Promise<void>;
  setResolved(threadId: string, resolved: boolean): void | Promise<void>;
  deleteComment(threadId: string, commentId: string): void | Promise<void>;
  deleteThread(threadId: string): void | Promise<void>;
}

const MAX_ID = 128;
const MAX_NAME = 200;
const MAX_QUOTE = 2_000;
const MAX_CONTENT = 20_000;

const str = (value: unknown, max: number): string | null =>
  typeof value === 'string' ? value.slice(0, max) : null;
const time = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

/** A user from untrusted data, or `null`. */
export function parseCommentUser(value: unknown): CommentUser | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id, MAX_ID);
  const name = str(raw.name, MAX_NAME);
  if (!id || name === null) return null;
  const color = str(raw.color, 64);
  return color ? { id, name, color } : { id, name };
}

function parseComment(value: unknown): TeiComment | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id, MAX_ID);
  const author = parseCommentUser(raw.author);
  const content = str(raw.content, MAX_CONTENT);
  if (!id || !author || content === null) return null;
  return { id, author, content, createdAt: time(raw.createdAt) };
}

/**
 * Threads from untrusted data (a server response, saved JSON): anything
 * malformed is dropped, strings are capped, ids are unique.
 */
export function parseCommentThreads(value: unknown): CommentThread[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const threads: CommentThread[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const id = str(raw.id, MAX_ID);
    if (!id || seen.has(id)) continue;
    const comments = Array.isArray(raw.comments)
      ? raw.comments.flatMap((c) => parseComment(c) ?? [])
      : [];
    if (comments.length === 0) continue;
    seen.add(id);
    threads.push({
      id,
      quote: str(raw.quote, MAX_QUOTE) ?? '',
      comments,
      resolved: raw.resolved === true,
      createdAt: time(raw.createdAt) || (comments[0] as TeiComment).createdAt,
    });
  }
  return threads;
}

/** Threads in memory: the default store, and the model for your own. */
export function createMemoryCommentStore(initial: unknown = []): CommentStore {
  let threads: readonly CommentThread[] = parseCommentThreads(initial);
  const listeners = new Set<() => void>();
  const set = (next: readonly CommentThread[]) => {
    threads = next;
    for (const listener of [...listeners]) listener();
  };
  const patch = (id: string, change: (thread: CommentThread) => CommentThread) => {
    const at = threads.findIndex((thread) => thread.id === id);
    if (at < 0) return;
    const before = threads[at] as CommentThread;
    const after = change(before);
    if (after === before) return;
    const next = [...threads];
    next[at] = after;
    set(next);
  };
  return {
    getThreads: () => threads,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addThread(thread) {
      if (threads.some((t) => t.id === thread.id)) return;
      set([...threads, thread]);
    },
    addComment(threadId, comment) {
      patch(threadId, (thread) => ({ ...thread, comments: [...thread.comments, comment] }));
    },
    setResolved(threadId, resolved) {
      patch(threadId, (thread) =>
        thread.resolved === resolved ? thread : { ...thread, resolved },
      );
    },
    deleteComment(threadId, commentId) {
      patch(threadId, (thread) => ({
        ...thread,
        comments: thread.comments.filter((comment) => comment.id !== commentId),
      }));
    },
    deleteThread(threadId) {
      if (!threads.some((t) => t.id === threadId)) return;
      set(threads.filter((thread) => thread.id !== threadId));
    },
  };
}
