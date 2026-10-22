'use client';

import type { ReadonlySignal } from '@lexical/extension';
import type { ComponentPropsWithoutRef } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type {
  CollaborationPeer,
  CollaborationStorage,
  CollaborationStatus as Status,
} from '../../extensions/collaboration/index.js';
import { useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { cx } from '../ui/context.js';
import { useSignal } from '../use-signal.js';

export interface CollaborationStatusProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Most avatars shown before "+n". Default 4. */
  max?: number;
  /** Show this user too, first. Default false. */
  showSelf?: boolean;
  /** A button to go offline and back. Default false. */
  toggle?: boolean;
}

const NONE: readonly CollaborationPeer[] = [];

/** Up to two letters for an avatar: "Ada Lovelace" → "AL". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? [words[0], words.at(-1)].map((word) => Array.from(word as string)[0])
      : Array.from(words[0] ?? '?').slice(0, 2);
  return letters.join('').toUpperCase();
}

/** A colour from the network goes in through CSSOM, which drops what is not a colour. */
const paint = (color: string) => (element: HTMLElement | null) => {
  element?.style.setProperty('--tei-peer-color', color);
};

/**
 * Who else is in the document, and whether this one is connected: a
 * coloured avatar per person (their initials; names on hover and for
 * screen readers) and the connection state, which is announced when it
 * changes. Needs the `Collaboration` extension; renders nothing without.
 *
 * ```tsx
 * <Editor slots={{ footer: <CollaborationStatus /> }} />
 * ```
 */
export function CollaborationStatus({
  editor: editorProp,
  max = 4,
  showSelf = false,
  toggle = false,
  className,
  ...rest
}: CollaborationStatusProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor)
    throw new Error('teieditor: <CollaborationStatus> needs an `editor` prop or a provider');
  const storage = (
    editor.extension('@teispace/teieditor/collaboration')?.output as
      | { storage?: CollaborationStorage }
      | undefined
  )?.storage;
  const status = useSignal(storage?.status as ReadonlySignal<Status> | undefined) ?? 'disconnected';
  const synced = useSignal(storage?.synced) ?? false;
  const peers = useSignal(storage?.peers) ?? NONE;
  const self = useSignal(storage?.self) ?? null;
  if (!storage) return null;

  const people = showSelf && self ? [self, ...peers] : peers;
  const shown = people.slice(0, Math.max(0, max));
  const hidden = people.length - shown.length;
  const state = status === 'connected' && !synced ? 'syncing' : status;
  const label = editor.t(`collaboration.status.${state}`);
  const count =
    peers.length === 0
      ? editor.t('collaboration.alone')
      : editor.t(peers.length === 1 ? 'collaboration.peers.one' : 'collaboration.peers.other', {
          count: peers.length,
        });

  return (
    <div
      {...rest}
      className={cx('tei-portal', 'tei-collab-status', className)}
      role="group"
      aria-label={editor.t('collaboration.label')}
      data-tei-collab-status=""
      data-state={state}
    >
      <ul className="tei-collab-avatars" aria-label={count}>
        {shown.map((peer) => {
          const name =
            peer.clientId === self?.clientId
              ? editor.t('collaboration.you', { name: peer.name })
              : peer.name;
          return (
            <li
              key={peer.clientId}
              ref={paint(peer.color)}
              className="tei-collab-avatar"
              data-focusing={peer.focusing ? '' : undefined}
              title={name}
            >
              <span aria-hidden="true">{initials(peer.name)}</span>
              <span className="tei-sr-only">{name}</span>
            </li>
          );
        })}
        {hidden > 0 && (
          <li
            className="tei-collab-avatar"
            data-more=""
            title={editor.t('collaboration.more', { count: hidden })}
          >
            <span aria-hidden="true">+{hidden}</span>
            <span className="tei-sr-only">{editor.t('collaboration.more', { count: hidden })}</span>
          </li>
        )}
      </ul>
      <span className="tei-collab-state" role="status" aria-live="polite">
        <span className="tei-collab-dot" aria-hidden="true" />
        {label}
      </span>
      {toggle && (
        <Button
          size="sm"
          variant="ghost"
          className="tei-collab-toggle"
          onClick={() =>
            status === 'disconnected' ? editor.commands.connect() : editor.commands.disconnect()
          }
        >
          {editor.t(
            status === 'disconnected' ? 'collaboration.connect' : 'collaboration.disconnect',
          )}
        </Button>
      )}
    </div>
  );
}
