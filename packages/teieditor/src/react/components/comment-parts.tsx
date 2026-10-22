'use client';

import { useCallback } from 'react';
import { getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { CommentsOptions, CommentsStorage } from '../../extensions/comments/index.js';
import type { ReviewOptions, ReviewStorage } from '../../extensions/review/index.js';
import { editorLocale } from '../../utils/locale.js';

export const COMMENTS = '@teispace/teieditor/comments';
export const REVIEW = '@teispace/teieditor/review';

/** The Comments extension's storage, found by name (so this UI never loads the extension). */
export const commentsStorage = (editor: TeiEditor) =>
  (editor.extension(COMMENTS)?.output as { storage?: CommentsStorage } | undefined)?.storage;

export const commentsOptions = (editor: TeiEditor) =>
  getPeerOptions<CommentsOptions>(editor.lexical, COMMENTS);

/** The Review extension's storage, by name. */
export const reviewStorage = (editor: TeiEditor) =>
  (editor.extension(REVIEW)?.output as { storage?: ReviewStorage } | undefined)?.storage;

export const reviewOptions = (editor: TeiEditor) =>
  getPeerOptions<ReviewOptions>(editor.lexical, REVIEW);

/** The commenting user, as the extension names them. */
export function currentUser(editor: TeiEditor): { id: string; name: string; color?: string } {
  return commentsOptions(editor)?.user ?? { id: 'anonymous', name: editor.t('comments.anonymous') };
}

/** The keys that post a comment, as this platform writes them. */
export const submitKey = (editor: TeiEditor) =>
  editor.shortcut('addComment')?.[0] === '⌘' ? '⌘↵' : 'Ctrl+Enter';

/** A user's initials in a circle, tinted with their colour when they have one. */
export function Avatar({ user }: { user: { name: string; color?: string } }) {
  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? '')
      .join('')
      .toUpperCase() || '?';
  const color = user.color;
  // Through the CSSOM, never a style attribute: strict CSPs allow it.
  const tint = useCallback(
    (element: HTMLSpanElement | null) => {
      if (!element) return;
      if (color) element.style.setProperty('--tei-avatar-bg', color.slice(0, 64));
      else element.style.removeProperty('--tei-avatar-bg');
    },
    [color],
  );
  return (
    <span ref={tint} className="tei-avatar" aria-hidden="true" data-tinted={color ? '' : undefined}>
      {initials}
    </span>
  );
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 minutes ago", "yesterday", in the editor's language; the full date for a tooltip. */
export function formatTime(editor: TeiEditor, time: number, now = Date.now()) {
  const locale = editorLocale(editor.lexical);
  const date = new Date(time);
  const full = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  const seconds = Math.round((time - now) / 1000);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return { short: relative.format(Math.round(seconds / size), unit), full };
    }
  }
  return { short: relative.format(0, 'second'), full };
}
