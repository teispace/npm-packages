import { KEY_DOWN_COMMAND } from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import { matchesShortcut, registerExtensionKeyBindings } from '../../src/core/keybindings.js';
import type { TeiExtension } from '../../src/core/types.js';
import { createTestEditor } from '../helpers/lexical-test-env.js';

const makeExt = (
  name: string,
  bindings: Record<string, (editor: unknown) => boolean>,
): TeiExtension =>
  ({
    name,
    getKeyBindings: () => bindings as never,
  }) as unknown as TeiExtension;

describe('matchesShortcut', () => {
  it('matches Mod+B (ctrl on non-mac)', () => {
    const event = { key: 'b', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(matchesShortcut('Mod+B', event as KeyboardEvent)).toBe(true);
  });

  it('requires shift when specified, rejects when absent', () => {
    const withShift = { key: 'k', ctrlKey: true, shiftKey: true, altKey: false } as KeyboardEvent;
    const noShift = { key: 'k', ctrlKey: true, shiftKey: false, altKey: false } as KeyboardEvent;
    expect(matchesShortcut('Mod+Shift+K', withShift)).toBe(true);
    expect(matchesShortcut('Mod+Shift+K', noShift)).toBe(false);
  });

  it('rejects a different key', () => {
    const event = { key: 'x', ctrlKey: true, shiftKey: false, altKey: false } as KeyboardEvent;
    expect(matchesShortcut('Mod+B', event)).toBe(false);
  });
});

describe('registerExtensionKeyBindings on the headless core path', () => {
  it('registers a KEY_DOWN handler and dispatches the matching binding', () => {
    const editor = createTestEditor();
    const boldHandler = vi.fn(() => true);
    const unregister = registerExtensionKeyBindings(editor, [
      makeExt('bold', { 'Mod+B': boldHandler }),
    ]);

    // Simulate a Ctrl+B keydown through the command system.
    const event = {
      key: 'b',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    editor.dispatchCommand(KEY_DOWN_COMMAND, event);

    expect(boldHandler).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalled();
    unregister();
  });

  it('is idempotent: a second registration for the same editor is a no-op', () => {
    const editor = createTestEditor();
    const handler = vi.fn(() => true);
    const ext = makeExt('bold', { 'Mod+B': handler });

    const un1 = registerExtensionKeyBindings(editor, [ext]);
    const un2 = registerExtensionKeyBindings(editor, [ext]); // should not double-register

    const event = {
      key: 'b',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    editor.dispatchCommand(KEY_DOWN_COMMAND, event);

    // Only one handler fired despite two register calls.
    expect(handler).toHaveBeenCalledTimes(1);
    un1();
    un2();
  });

  it('returns a no-op when no extension declares a binding', () => {
    const editor = createTestEditor();
    const unregister = registerExtensionKeyBindings(editor, [makeExt('plain', {})]);
    expect(unregister).toBeTypeOf('function');
    unregister(); // must not throw
  });
});
