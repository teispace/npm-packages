import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { $isCardNode, CARD_ACCENTS, Card } from '../../src/extensions/card/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: string | object, { markdown = false } = {}) {
  const editor = createTeiEditor({
    extensions: [StarterKit, Card],
    content,
    contentFormat: markdown ? 'markdown' : undefined,
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

/** The document as `type text` lines; a card's blocks indented under it. */
const outline = (editor: TeiEditor) =>
  editor.read(() => {
    const lines: string[] = [];
    const visit = (node: LexicalNode, pad: string) => {
      if ($isCardNode(node)) {
        lines.push(
          `${pad}card:${node.getVariant()}${node.getAccent() ? `/${node.getAccent()}` : ''}`,
        );
        for (const child of node.getChildren()) visit(child, `${pad}  `);
      } else lines.push(`${pad}${node.getType()} ${node.getTextContent()}`.trimEnd());
    };
    for (const child of $getRoot().getChildren()) visit(child, '');
    return lines;
  });

/** The caret at `offset` in the text node whose text is `text`, or in the last empty block. */
const caret = (editor: TeiEditor, text: string, offset = text.length) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text);
    if (node) (node as TextNode).select(offset, offset);
    else {
      const empty: LexicalNode[] = [];
      const walk = (n: LexicalNode) => {
        if ($isElementNode(n)) {
          if (n.isEmpty() && !$isCardNode(n)) empty.push(n);
          n.getChildren().forEach(walk);
        }
      };
      walk($getRoot());
      const last = empty.at(-1);
      if ($isElementNode(last)) last.select();
    }
  });

const key = (
  editor: TeiEditor,
  command: typeof KEY_ENTER_COMMAND,
  init: KeyboardEventInit = {},
) => {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  let handled = false;
  editor.lexical.update(
    () => {
      handled = editor.lexical.dispatchCommand(command, event);
    },
    { discrete: true },
  );
  return { handled, prevented: event.defaultPrevented };
};

const CARD = '<div data-tei-card="outlined"><h2>Plan</h2><p>Body</p></div><p>After</p>';

describe('Card: HTML, markdown and JSON', () => {
  it('saves as <div data-tei-card>, and reads that, and its JSON, back', () => {
    const editor = make(
      '<div data-tei-card="filled" data-tei-card-accent="blue"><p>One</p><ul><li>Two</li></ul></div>',
    );
    const shape = ['card:filled/blue', '  paragraph One', '  list Two'];
    expect(outline(editor)).toEqual(shape);
    const html = editor.getHTML();
    expect(html).toBe(
      '<div data-tei-card="filled" data-tei-card-accent="blue"><p>One</p><ul><li>Two</li></ul></div>',
    );
    expect(outline(make(html))).toEqual(shape);
    expect(outline(make(editor.getJSON()))).toEqual(shape);
  });

  it('draws its look and accent as data attributes the stylesheet knows', () => {
    const editor = make(CARD);
    const box = editor.lexical.getRootElement()?.querySelector('.tei-card');
    expect(box?.getAttribute('data-variant')).toBe('outlined');
    expect(box?.hasAttribute('data-accent')).toBe(false);
    caret(editor, 'Body');
    editor.commands.setCardAccent('red');
    expect(box?.getAttribute('data-accent')).toBe('red');
    editor.commands.setCardAccent(null);
    expect(box?.hasAttribute('data-accent')).toBe(false);
  });

  it('hostile names never reach an attribute: unknown looks are the default, accents none', () => {
    const editor = make(
      '<div data-tei-card="&quot; onclick=x" data-tei-card-accent="url(javascript:x)"><p>a</p></div>',
    );
    expect(outline(editor)[0]).toBe('card:default');
    expect(editor.getHTML()).toBe('<div data-tei-card="default"><p>a</p></div>');
    const json = make({
      root: {
        type: 'root',
        version: 1,
        children: [
          { type: 'card', variant: 'x" y', accent: { evil: 1 }, children: [], version: 1 },
        ],
      },
    });
    expect(outline(json)).toEqual(['card:default', '  paragraph']);
    const root = json.lexical.getRootElement()?.querySelector('.tei-card');
    expect(root?.getAttribute('data-variant')).toBe('default');
    expect(root?.hasAttribute('data-accent')).toBe(false);
  });

  it('is an HTML-comment fence in markdown, nesting, with words checked', () => {
    const md =
      '<!-- card outlined green -->\n\nOne\n\n<!-- card -->\n\n- Two\n\n<!-- /card -->\n\n<!-- /card -->\n\nAfter';
    const editor = make(md, { markdown: true });
    expect(outline(editor)).toEqual([
      'card:outlined/green',
      '  paragraph One',
      '  card:default',
      '    list Two',
      'paragraph After',
    ]);
    expect(editor.getMarkdown()).toBe(md);
    expect(outline(make(editor.getMarkdown(), { markdown: true }))).toEqual(outline(editor));
    // Unknown words are dropped; case does not matter.
    expect(
      outline(make('<!-- CARD bogus Filled -->\nx\n<!-- /card -->', { markdown: true })),
    ).toEqual(['card:filled', '  paragraph x']);
  });

  it('an unclosed fence, and an empty one', () => {
    const open = make('<!-- card -->\n\ntext', { markdown: true });
    expect(outline(open).some((line) => line.startsWith('card'))).toBe(false);
    expect(outline(make('<!-- card -->\n<!-- /card -->', { markdown: true }))).toEqual([
      'card:default',
      '  paragraph',
    ]);
  });
});

describe('Card: commands', () => {
  it('sets the selected blocks in one card; the caret stays in', () => {
    const editor = make('<p>One</p><p>Two</p><p>Three</p>');
    editor.update(() => {
      const [one, two] = $getRoot().getAllTextNodes();
      const selection = one?.select(1, 1);
      selection?.focus.set(two?.getKey() ?? '', 1, 'text');
    });
    expect(editor.can().setCard()).toBe(true);
    expect(editor.isActive('card')).toBe(false);
    editor.commands.setCard('filled');
    expect(outline(editor)).toEqual([
      'card:filled',
      '  paragraph One',
      '  paragraph Two',
      'paragraph Three',
    ]);
    expect(editor.isActive('card')).toBe(true);
    expect(editor.isActive('cardVariant', 'filled')).toBe(true);
    expect(editor.isActive('cardAccent', null)).toBe(true);
  });

  it('in a card: set changes its look, toggle takes it away; unknown names do nothing', () => {
    const editor = make(CARD);
    caret(editor, 'Body');
    editor.commands.setCard('filled');
    expect(outline(editor)[0]).toBe('card:filled');
    expect(editor.commands.setCardVariant('glass' as never)).toBe(false);
    expect(editor.can().setCardVariant('glass' as never)).toBe(false);
    expect(editor.can().setCard('glass' as never)).toBe(false);
    expect(editor.commands.setCardAccent('#f00' as never)).toBe(false);
    expect(editor.can().setCardAccent('#f00' as never)).toBe(false);
    editor.commands.setCardAccent('purple');
    expect(outline(editor)[0]).toBe('card:filled/purple');
    expect(editor.isActive('cardAccent', 'purple')).toBe(true);
    editor.commands.toggleCard('default');
    expect(outline(editor)[0]).toBe('card:default/purple');
    editor.commands.toggleCard();
    expect(outline(editor)).toEqual(['heading Plan', 'paragraph Body', 'paragraph After']);
    expect(editor.can().unsetCard()).toBe(false);
    expect(editor.can().setCardVariant('outlined')).toBe(false);
  });

  it('unset by key keeps its blocks where it was; the innermost card is the one meant', () => {
    const editor = make(
      '<p>Before</p><div data-tei-card="default"><p>Out</p><div data-tei-card="filled"><p>In</p></div></div>',
    );
    caret(editor, 'In');
    editor.commands.setCardVariant('outlined');
    expect(outline(editor)).toEqual([
      'paragraph Before',
      'card:default',
      '  paragraph Out',
      '  card:outlined',
      '    paragraph In',
    ]);
    const outer = editor.read(() => $getRoot().getChildAtIndex(1)?.getKey() ?? '');
    editor.commands.unsetCard(outer);
    expect(outline(editor)).toEqual([
      'paragraph Before',
      'paragraph Out',
      'card:outlined',
      '  paragraph In',
    ]);
    expect(editor.commands.unsetCard('nope')).toBe(false);
  });

  it('offers its looks and accents in the card menu, and itself in the slash and block menus', () => {
    const editor = make(CARD);
    expect(editor.items('cardMenu').map((i) => i.id)).toEqual([
      'card-default',
      'card-outlined',
      'card-filled',
      'card-accent-none',
      ...CARD_ACCENTS.map((a) => `card-accent-${a}`),
      'unsetCard',
    ]);
    expect(editor.items('slash').some((i) => i.id === 'card')).toBe(true);
    expect(editor.items('blockMenu').some((i) => i.id === 'card')).toBe(true);
  });
});

describe('Card: keys and shape', () => {
  it('Enter on an empty last line leaves the card; its only line stays', () => {
    const editor = make('<div data-tei-card="default"><p>One</p><p><br></p></div>');
    caret(editor, '');
    expect(key(editor, KEY_ENTER_COMMAND).prevented).toBe(true);
    expect(outline(editor)).toEqual(['card:default', '  paragraph One', 'paragraph']);
    editor.read(() => {
      const selection = $getSelection();
      expect(
        $isRangeSelection(selection) && selection.anchor.getNode().getParent()?.getType(),
      ).toBe('root');
    });
    const only = make('<div data-tei-card="default"><p><br></p></div>');
    caret(only, '');
    key(only, KEY_ENTER_COMMAND);
    expect(outline(only)).toEqual(['card:default', '  paragraph', '  paragraph']);
  });

  it('Backspace at the start of its first line takes it away; elsewhere it does not', () => {
    const CARD2 = '<div data-tei-card="default"><p>Read</p><p>More</p></div>';
    // Elsewhere the card stays (what the key deletes is the browser's to do).
    for (const [text, offset] of [
      ['More', 0],
      ['Read', 2],
    ] as const) {
      const other = make(CARD2);
      caret(other, text, offset);
      key(other, KEY_BACKSPACE_COMMAND);
      expect(outline(other)[0]).toBe('card:default');
    }
    const editor = make(CARD2);
    caret(editor, 'Read', 0);
    expect(key(editor, KEY_BACKSPACE_COMMAND).prevented).toBe(true);
    expect(outline(editor)).toEqual(['paragraph Read', 'paragraph More']);
  });

  it('is never empty, and a stray inline goes in a line', () => {
    const editor = make({
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'card',
            variant: 'filled',
            accent: 'green',
            version: 1,
            children: [
              {
                type: 'text',
                text: 'loose',
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
          { type: 'card', variant: 'outlined', accent: null, children: [], version: 1 },
        ],
      },
    });
    expect(outline(editor)).toEqual([
      'card:filled/green',
      '  paragraph loose',
      'card:outlined',
      '  paragraph',
    ]);
  });
});
