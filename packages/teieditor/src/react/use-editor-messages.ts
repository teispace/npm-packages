'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { TeiEditor } from '../core/editor.js';

/**
 * The editor's messages, re-rendering when `setMessages` changes them (a
 * language switch). Read words with `editor.t` as usual; this hook is what
 * makes a component of your own follow the switch.
 */
export function useEditorMessages(editor: TeiEditor): Readonly<Record<string, string>> {
  const subscribe = useCallback(
    (notify: () => void) => editor.on('onMessagesChange', () => notify()),
    [editor],
  );
  const get = () => editor.messages;
  return useSyncExternalStore(subscribe, get, get);
}
