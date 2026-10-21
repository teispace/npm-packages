import { $getRoot, type ElementNode } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  isSafeStyleValue,
  nextFontSize,
  TextStyle,
} from '../../src/extensions/text-style/index.js';
import {
  createTeiEditor,
  getExtensionOptions,
  setExtensionOptions,
  type TeiEditor,
} from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content = '<p>Hello world</p>', extensions: unknown[] = [StarterKit, TextStyle]) {
  const editor = createTeiEditor({ extensions: extensions as never, content });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

function select(editor: TeiEditor, from = 0, to?: number, index = 0) {
  editor.update(() => {
    const block = $getRoot().getChildAtIndex(index) as ElementNode;
    const text = block.getFirstDescendant();
    if (to === undefined) block.select(0, block.getChildrenSize());
    else if (text) (text as unknown as { select(a: number, b: number): void }).select(from, to);
  });
}

describe('TextStyle', () => {
  it('styles the selected text only, and exports the styles', () => {
    const editor = make();
    select(editor, 0, 5);
    expect(editor.commands.setColor('#dc2626')).toBe(true);
    // Browsers write colours back as rgb().
    expect(editor.getHTML()).toBe(
      '<p><span style="color: rgb(220, 38, 38);">Hello</span> world</p>',
    );
    expect(editor.isActive('color', '#dc2626')).toBe(true);
    expect(editor.isActive('color', '#2563eb')).toBe(false);
  });

  it('sets each property, and null takes it off', () => {
    const editor = make();
    select(editor);
    editor
      .chain()
      .setFontFamily('Georgia, serif')
      .setFontSize(20)
      .setColor('#2563eb')
      .setBackgroundColor('rgb(234 179 8 / 0.35)')
      .run();
    expect(editor.getHTML()).toBe(
      '<p><span style="font-family: Georgia, serif; font-size: 20px; color: rgb(37, 99, 235); background-color: rgba(234, 179, 8, 0.35);">Hello world</span></p>',
    );
    expect(editor.isActive('fontFamily', 'Georgia, serif')).toBe(true);
    expect(editor.isActive('fontSize', 20)).toBe(true);
    expect(editor.isActive('backgroundColor', 'rgb(234 179 8 / 0.35)')).toBe(true);
    editor.commands.setColor(null);
    editor.commands.setFontSize(null);
    expect(editor.getHTML()).toBe(
      '<p><span style="font-family: Georgia, serif; background-color: rgba(234, 179, 8, 0.35);">Hello world</span></p>',
    );
    editor.commands.unsetTextStyle();
    expect(editor.getHTML()).toBe('<p>Hello world</p>');
  });

  it('reads its styles back from HTML, keeping formats Lexical reads from the span', () => {
    const html =
      '<p><span style="font-size: 20px; color: #dc2626; font-weight: bold;">Hi</span> there</p>';
    const editor = make(html);
    expect(editor.getHTML()).toBe(
      '<p><strong style="font-size: 20px; color: rgb(220, 38, 38);">Hi</strong> there</p>',
    );
    // And the export reads back the same.
    const again = make(editor.getHTML());
    expect(again.getHTML()).toBe(editor.getHTML());
  });

  it('keeps nothing unsafe or unknown from pasted styles', () => {
    const editor = make(
      '<p><span style="color: red; background-image: url(https://evil.test/x); position: fixed; font-family: x;expression(alert(1))">a</span>' +
        '<span style="background-color: transparent; color: inherit; font-size: 11pt">b</span>' +
        '<span style="color: url(javascript:alert(1))">c</span></p>',
    );
    expect(editor.getHTML()).toBe(
      // `font-family: x` is harmless; what followed the `;` is not read at all.
      '<p><span style="font-family: x; color: red;">a</span><span style="font-size: 11pt;">b</span>c</p>',
    );
  });

  it('an inner style wins over the one around it, through links too', () => {
    const editor = make(
      '<p><span style="color: #dc2626; font-size: 20px;">a<span style="color: #2563eb;">b</span>' +
        '<a href="https://example.com">c</a></span></p>',
    );
    expect(editor.getHTML()).toBe(
      '<p><span style="font-size: 20px; color: rgb(220, 38, 38);">a</span>' +
        '<span style="font-size: 20px; color: rgb(37, 99, 235);">b</span>' +
        '<a href="https://example.com"><span style="font-size: 20px; color: rgb(220, 38, 38);">c</span></a></p>',
    );
  });

  it('writes exported styles through the CSSOM, never the style attribute', () => {
    const editor = make('<p><span style="color: #dc2626;">Hello</span></p>');
    const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
    try {
      editor.getHTML();
      expect(setAttribute.mock.calls.filter(([name]) => name === 'style')).toEqual([]);
    } finally {
      setAttribute.mockRestore();
    }
  });

  it('refuses unsafe values from code too', () => {
    const editor = make();
    select(editor);
    expect(editor.commands.setColor('red; position: fixed')).toBe(false);
    expect(editor.commands.setBackgroundColor('url(x)')).toBe(false);
    expect(editor.commands.setFontFamily('x; color: red')).toBe(false);
    expect(editor.commands.setFontSize('1e9px')).toBe(false);
    expect(editor.getHTML()).toBe('<p>Hello world</p>');
  });

  it('clamps sizes, and steps along the scale from the current size', () => {
    const editor = make();
    select(editor);
    editor.commands.setFontSize(500);
    expect(editor.isActive('fontSize', 96)).toBe(true);
    editor.commands.setFontSize(2);
    expect(editor.isActive('fontSize', 8)).toBe(true);
    expect(editor.can().decreaseFontSize()).toBe(false);
    editor.commands.setFontSize(null);
    // Unstyled text counts as the default size, 16.
    editor.commands.increaseFontSize();
    expect(editor.isActive('fontSize', 18)).toBe(true);
    editor.commands.decreaseFontSize();
    editor.commands.decreaseFontSize();
    expect(editor.isActive('fontSize', 14)).toBe(true);
    editor.commands.setFontSize(96);
    expect(editor.can().increaseFontSize()).toBe(false);
  });

  it('takes no styles in a code block', () => {
    const editor = make('<pre><code>x = 1</code></pre>');
    select(editor);
    expect(editor.can().setColor('#dc2626')).toBe(false);
  });

  it('clear formatting takes the styles off too', () => {
    const editor = make('<p><span style="color: #dc2626; font-size: 20px;">Hello</span></p>');
    select(editor);
    editor.commands.clearFormatting();
    expect(editor.getHTML()).toBe('<p>Hello</p>');
  });

  it('options are live through getExtensionOptions', () => {
    const editor = make();
    expect(getExtensionOptions(editor, TextStyle)?.defaultFontSize).toBe(16);
    setExtensionOptions(editor, TextStyle, { defaultFontSize: 20, maxFontSize: 24 });
    const options = getExtensionOptions(editor, TextStyle);
    expect(options?.defaultFontSize).toBe(20);
    select(editor);
    editor.commands.increaseFontSize();
    expect(editor.isActive('fontSize', 24)).toBe(true);
    expect(getExtensionOptions(make('<p>x</p>', [StarterKit]), TextStyle)).toBeUndefined();
  });

  it('contributes its controls to the toolbar, in order', () => {
    const editor = make();
    const ids = editor.items('toolbar').map((item) => item.id);
    const at = (id: string) => ids.indexOf(id);
    expect(at('fontFamily')).toBeLessThan(at('fontSize'));
    expect(at('fontSize')).toBeLessThan(at('bold'));
    expect(at('bold')).toBeLessThan(at('color'));
    expect(at('color')).toBeLessThan(at('backgroundColor'));
    expect(at('backgroundColor')).toBeLessThan(at('bulletList'));
  });
});

describe('isSafeStyleValue', () => {
  it.each([
    ['color', '#abc', true],
    ['color', 'oklch(0.5 0.2 30 / 50%)', true],
    ['color', 'rgb(1, 2, 3)', true],
    ['color', 'red', true],
    ['color', 'red;x', false],
    ['color', 'url(x)', false],
    ['color', 'transparent', false],
    ['font-size', '12px', true],
    ['font-size', '1.5em', true],
    ['font-size', 'calc(1px)', false],
    ['font-size', '12px; color: red', false],
    ['font-size', '12pxx', false],
    ['font-family', 'a'.repeat(201), false],
    ['color', 'rgb(url(x))', false],
    ['color', 'expression(alert(1))', false],
    ['font-family', '"Times New Roman", serif', true],
    ['font-family', 'a;b', false],
    ['font-family', 'a(b)', false],
  ] as const)('%s: %s → %s', (property, value, safe) => {
    expect(isSafeStyleValue(property, value)).toBe(safe);
  });
});

describe('nextFontSize', () => {
  it('moves to the neighbour on the scale, or by one off it', () => {
    expect(nextFontSize(16, [12, 16, 20], 1)).toBe(20);
    expect(nextFontSize(17, [12, 16, 20], -1)).toBe(16);
    expect(nextFontSize(20, [12, 16, 20], 1)).toBe(21);
    expect(nextFontSize(12, [12, 16, 20], -1)).toBe(11);
  });
});
