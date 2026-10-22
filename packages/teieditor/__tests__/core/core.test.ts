import { RichTextExtension } from '@lexical/rich-text';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_DOWN_COMMAND,
  type TextFormatType,
} from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTeiEditor,
  defineTeiExtension,
  setExtensionOptions,
  type TeiEditor,
} from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function make(options: Parameters<typeof createTeiEditor>[0]): TeiEditor {
  const editor = createTeiEditor(options);
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const $isFormat = (format: TextFormatType) => {
  const selection = $getSelection();
  return $isRangeSelection(selection) && selection.hasFormat(format);
};

const Bold = defineTeiExtension({
  name: 'test/bold',
  dependencies: [RichTextExtension],
  commands: {
    toggleBold: {
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        selection.formatText('bold');
      },
      can: () => $isRangeSelection($getSelection()),
    },
  },
  active: { bold: () => $isFormat('bold') },
  keymap: { toggleBold: { key: 'Mod-b', command: 'toggleBold' } },
  items: [
    { id: 'bold', label: 'Bold', in: ['toolbar', 'bubble'], command: 'toggleBold', active: 'bold' },
  ],
  messages: { Bold: 'Bold' },
});

function selectAll(editor: TeiEditor) {
  editor.update(() => {
    $getRoot().select(0, $getRoot().getChildrenSize());
  });
}

describe('createTeiEditor', () => {
  it('loads content, and reads it back in every core format', () => {
    const editor = make({ extensions: [Bold], content: 'one\ntwo', contentFormat: 'text' });
    expect(editor.getText()).toBe('one\n\ntwo');
    const json = editor.getJSON();
    const copy = make({ extensions: [Bold], content: json });
    expect(copy.getText()).toBe(editor.getText());
    expect(editor.formats).toEqual(expect.arrayContaining(['json', 'text']));
  });

  it('refuses malformed JSON whole, leaving the document as it was', () => {
    const editor = make({ extensions: [Bold], content: 'keep me', contentFormat: 'text' });
    expect(() =>
      editor.setContent({ root: { children: [{ type: 'no-such-node', version: 1 }] } }),
    ).toThrow();
    expect(editor.getText()).toBe('keep me');
    expect(() => editor.setContent({ nope: true })).toThrow(/root/);
  });

  it('runs commands, reports can() and isActive()', () => {
    const editor = make({ extensions: [Bold], content: 'hello', contentFormat: 'text' });
    expect(editor.isActive('bold')).toBe(false);
    selectAll(editor);
    expect(editor.can().toggleBold()).toBe(true);
    expect(editor.commands.toggleBold()).toBe(true);
    expect(editor.isActive('bold')).toBe(true);
    expect(editor.chain().toggleBold().run()).toBe(true);
    expect(editor.isActive('bold')).toBe(false);
  });

  it('throws a clear error for a command no extension provides', () => {
    const editor = make({ extensions: [Bold] });
    expect(() => editor.commands.nope()).toThrow(/no command named "nope"/);
  });

  it('is not mistaken for a promise', async () => {
    const editor = make({ extensions: [Bold] });
    expect((editor.commands as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(editor.commands)).resolves.toBe(editor.commands);
  });

  it('lets the app override a command, and the override call the original with next()', () => {
    const calls: string[] = [];
    const editor = make({
      extensions: [Bold],
      content: 'hello',
      contentFormat: 'text',
      commands: {
        toggleBold: {
          run: ({ next }) => {
            calls.push('app');
            return next();
          },
        },
      },
    });
    selectAll(editor);
    editor.commands.toggleBold();
    expect(calls).toEqual(['app']);
    expect(editor.isActive('bold')).toBe(true);
  });

  it('lets an extension override another one, the app overriding both', () => {
    const calls: string[] = [];
    const Loud = Bold.extend({
      commands: {
        toggleBold: {
          run: ({ next }) => {
            calls.push('extension');
            return next();
          },
        },
      },
    });
    const editor = make({
      extensions: [Loud],
      content: 'x',
      contentFormat: 'text',
      commands: {
        toggleBold: {
          run: ({ next }) => {
            calls.push('app');
            return next();
          },
        },
      },
    });
    selectAll(editor);
    editor.commands.toggleBold();
    expect(calls).toEqual(['app', 'extension']);
    expect(editor.isActive('bold')).toBe(true);
  });

  it('removes a command with null', () => {
    const editor = make({ extensions: [Bold], commands: { toggleBold: null } });
    expect(editor.hasCommand('toggleBold')).toBe(false);
    expect(editor.commands.toggleBold()).toBe(false);
  });

  it('runs middleware around every command, which can veto it', () => {
    const seen: string[] = [];
    const editor = make({
      extensions: [Bold],
      content: 'x',
      contentFormat: 'text',
      middleware: [
        ({ name }, next) => {
          seen.push(name);
          return name === 'toggleBold' ? false : next();
        },
      ],
    });
    selectAll(editor);
    expect(editor.commands.toggleBold()).toBe(false);
    expect(seen).toEqual(['toggleBold']);
    expect(editor.isActive('bold')).toBe(false);
  });

  it('dispatches a keymap entry through the same command, and lets the app remap it', () => {
    const editor = make({ extensions: [Bold], content: 'x', contentFormat: 'text' });
    selectAll(editor);
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
      editor.lexical.dispatchCommand(KEY_DOWN_COMMAND, event);
      return event;
    };
    const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? { metaKey: true } : { ctrlKey: true };
    expect(press({ key: 'b', ...mod }).defaultPrevented).toBe(true);
    expect(editor.isActive('bold')).toBe(true);

    const remapped = make({
      extensions: [Bold],
      content: 'x',
      contentFormat: 'text',
      keymap: { toggleBold: { key: 'Mod-Shift-b', command: 'toggleBold' } },
    });
    selectAll(remapped);
    const event = new KeyboardEvent('keydown', { key: 'b', cancelable: true, ...mod });
    remapped.lexical.dispatchCommand(KEY_DOWN_COMMAND, event);
    expect(remapped.isActive('bold')).toBe(false);
  });

  it('collects UI items, which the app can hide or replace', () => {
    expect(
      make({ extensions: [Bold] })
        .items('toolbar')
        .map((i) => i.id),
    ).toEqual(['bold']);
    expect(make({ extensions: [Bold], items: { bold: null } }).items('toolbar')).toEqual([]);
    const relabelled = make({
      extensions: [Bold],
      items: { bold: { id: 'bold', label: 'Strong', in: ['bubble'], command: 'toggleBold' } },
    });
    expect(relabelled.items('toolbar')).toEqual([]);
    expect(relabelled.items('bubble')[0]?.label).toBe('Strong');
  });

  it('translates through messages, the app overriding extensions', () => {
    const editor = make({ extensions: [Bold], messages: { Bold: 'Gras' } });
    expect(editor.t('Bold')).toBe('Gras');
    expect(editor.t('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('fires events to extension handlers, option handlers and on() listeners', () => {
    const order: string[] = [];
    const Watch = defineTeiExtension({
      name: 'test/watch',
      onCreate: () => order.push('extension:create'),
      onUpdate: () => order.push('extension:update'),
    });
    const editor = make({
      extensions: [Bold, Watch],
      onCreate: () => order.push('option:create'),
      onUpdate: ({ docChanged }) => order.push(`option:update:${docChanged}`),
    });
    expect(order).toEqual(['extension:create', 'option:create']);
    const off = editor.on('onUpdate', () => order.push('listener:update'));
    editor.setContent('changed', 'text');
    expect(order.slice(2)).toEqual(['extension:update', 'option:update:true', 'listener:update']);
    off();
  });

  it('gives extension code live options and storage, changeable at runtime', () => {
    const seen: number[] = [];
    const Counter = defineTeiExtension({
      name: 'test/counter',
      config: { step: 1 },
      storage: () => ({ total: 0 }),
      commands: {
        bump: {
          run: ({ options, storage }) => {
            storage.total += options.step;
            seen.push(storage.total);
          },
        },
      },
    });
    const editor = make({ extensions: [Counter.configure({ step: 2 })] });
    editor.commands.bump();
    setExtensionOptions(editor, Counter, { step: 10 });
    editor.commands.bump();
    expect(seen).toEqual([2, 12]);
  });

  it('flattens presets and skips disabled entries', () => {
    const Other = defineTeiExtension({
      name: 'test/other',
      commands: { other: { run: () => true } },
    });
    const preset = [Bold, [Other, false, null]];
    const editor = make({ extensions: [preset, undefined] });
    expect(editor.hasCommand('toggleBold')).toBe(true);
    expect(editor.hasCommand('other')).toBe(true);
  });

  it('reports a missing format with the ones that exist', () => {
    const editor = make({ extensions: [Bold] });
    expect(() => editor.getMarkdown()).toThrow(/no "markdown" content format.*json, text/);
  });

  it('is empty only with a single empty paragraph', () => {
    const editor = make({ extensions: [Bold] });
    expect(editor.isEmpty).toBe(true);
    editor.setContent('a', 'text');
    expect(editor.isEmpty).toBe(false);
  });

  it('cleans up on destroy', () => {
    const onDestroy = vi.fn();
    const editor = createTeiEditor({ extensions: [Bold], onDestroy });
    editor.destroy();
    expect(onDestroy).toHaveBeenCalledOnce();
  });
});
