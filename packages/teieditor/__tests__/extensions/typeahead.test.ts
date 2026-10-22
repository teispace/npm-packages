import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setCompositionKey,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  KEY_DOWN_COMMAND,
  type TextNode,
} from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdUi } from '../../src/core/ui-request.js';
import { EMOJI_DATA } from '../../src/extensions/emoji/data.js';
import {
  Emoji,
  type EmojiStorage,
  loadBuiltInEmoji,
  parseEmojiData,
  searchEmoji,
} from '../../src/extensions/emoji/index.js';
import { Hashtag } from '../../src/extensions/hashtag/index.js';
import {
  $isMentionNode,
  Mention,
  type MentionItem,
  type MentionOptions,
} from '../../src/extensions/mention/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import {
  $matchTypeahead,
  $replaceTypeahead,
  addTypeaheadSources,
  getTypeahead,
  Typeahead,
  type TypeaheadStorage,
} from '../../src/extensions/typeahead/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function make(extensions: unknown[], content: string | object = '<p><br></p>', markdown = false) {
  const editor = createTeiEditor({
    extensions: [StarterKit, ...(extensions as [])],
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

/** The caret at the end of the last text, or in the empty first paragraph. */
const caretAtEnd = (editor: TeiEditor) => editor.update(() => $getRoot().selectEnd());

/** The caret at the end of the text node whose text is `text`, taking its format. */
const caretIn = (editor: TeiEditor, text: string) =>
  editor.update(() => {
    const node = $getRoot()
      .getAllTextNodes()
      .find((t) => t.getTextContent() === text) as TextNode;
    node.select();
  });

/** Type text at the caret, one character per update, as keys would. */
function type(editor: TeiEditor, text: string) {
  for (const char of text) {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(char);
    });
  }
}

const key = (editor: TeiEditor, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  editor.lexical.update(
    () => {
      editor.lexical.dispatchCommand(KEY_DOWN_COMMAND, event);
    },
    { discrete: true },
  );
  return event.defaultPrevented;
};

const typeahead = (editor: TeiEditor) => getTypeahead(editor) as TypeaheadStorage;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the typeahead engine', () => {
  const match = (editor: TeiEditor, pattern: Parameters<typeof $matchTypeahead>[0]) =>
    editor.read(() => $matchTypeahead(pattern));

  it('matches a trigger at the start or after whitespace, up to the caret', () => {
    const editor = make([]);
    caretAtEnd(editor);
    type(editor, 'hi @ada');
    expect(match(editor, { trigger: '@' })).toMatchObject({
      trigger: '@',
      query: 'ada',
      offset: 3,
    });
    type(editor, ' x');
    expect(match(editor, { trigger: '@' })).toBeNull();
    expect(match(editor, { trigger: '@', spaces: true })?.query).toBe('ada x');
    type(editor, '  y');
    expect(match(editor, { trigger: '@', spaces: true })).toBeNull();
  });

  it('not mid-word, not in code, not past maxLength, not under minLength', () => {
    const editor = make([]);
    caretAtEnd(editor);
    type(editor, 'mail@ada');
    expect(match(editor, { trigger: '@' })).toBeNull();
    type(editor, ' :a');
    expect(match(editor, { trigger: ':', minLength: 2 })).toBeNull();
    type(editor, 'b');
    expect(match(editor, { trigger: ':', minLength: 2 })?.query).toBe('ab');
    expect(match(editor, { trigger: ':', maxLength: 1 })).toBeNull();
    // A query character the pattern does not allow ends it.
    type(editor, '!');
    expect(match(editor, { trigger: ':', allow: (c) => /\w/.test(c) })).toBeNull();

    const code = make([], '<pre><code>x</code></pre>');
    caretAtEnd(code);
    type(code, ' @a');
    expect(match(code, { trigger: '@' })).toBeNull();
    const inline = make([], '<p><code>x @a</code></p>');
    caretIn(inline, 'x @a');
    expect(match(inline, { trigger: '@' })).toBeNull();
  });

  it('a query may not start with a space', () => {
    const editor = make([]);
    caretAtEnd(editor);
    type(editor, '/ a');
    expect(match(editor, { trigger: '/', spaces: true })).toBeNull();
  });

  it('never matches while an IME is composing', () => {
    const editor = make([]);
    caretAtEnd(editor);
    type(editor, '@ada');
    editor.update(() => {
      const node = $getRoot().getAllTextNodes()[0] as TextNode;
      $setCompositionKey(node.getKey());
    });
    expect(match(editor, { trigger: '@' })).toBeNull();
    editor.update(() => $setCompositionKey(null));
    expect(match(editor, { trigger: '@' })?.query).toBe('ada');
  });

  it('replaces the trigger and query with text or nodes, the caret after', () => {
    const editor = make([]);
    caretAtEnd(editor);
    type(editor, 'say :sm');
    editor.update(() => {
      const found = $matchTypeahead({ trigger: ':' });
      if (found) $replaceTypeahead(found, '😄');
    });
    type(editor, '!');
    expect(editor.getText()).toBe('say 😄!');
    type(editor, ' @x');
    editor.update(() => {
      const found = $matchTypeahead({ trigger: '@' });
      if (found) $replaceTypeahead(found, [$createTextNode('[X]'), $createTextNode(' ')]);
    });
    type(editor, 'end');
    expect(editor.getText()).toBe('say 😄! [X] end');
  });
});

describe('Typeahead', () => {
  function withSource(
    search = vi.fn((q: string) => [{ id: q, label: `Row ${q}` }]),
    spaces = false,
  ) {
    const editor = make([Typeahead]);
    const picked: string[] = [];
    addTypeaheadSources(editor, () => [
      {
        id: 'test',
        trigger: '+',
        label: 'Test',
        spaces,
        search,
        select: (option, found) => {
          picked.push(option.id);
          $replaceTypeahead(found, option.label);
        },
      },
    ]);
    caretAtEnd(editor);
    return { editor, picked, search };
  }

  it('opens on its trigger, searches, and closes when the trigger goes', () => {
    const { editor, search } = withSource();
    type(editor, '+ab');
    const state = typeahead(editor).state.value;
    expect(state).toMatchObject({ source: 'test', loading: false, highlighted: 0, visible: true });
    expect(state?.options.map((o) => o.id)).toEqual(['ab']);
    expect(search).toHaveBeenLastCalledWith('ab', expect.objectContaining({ trigger: '+' }));
    editor.update(() => {
      const paragraph = $createParagraphNode();
      $getRoot().clear().append(paragraph);
      paragraph.select();
    });
    expect(typeahead(editor).state.value).toBeNull();
  });

  it('keys move, pick and close, only with a UI there', () => {
    const { editor, picked } = withSource((q) => [
      { id: `${q}1`, label: 'One' },
      { id: `${q}2`, label: 'Two' },
    ]);
    type(editor, '+a');
    // No UI: keys pass through.
    expect(key(editor, { key: 'ArrowDown' })).toBe(false);
    const release = holdUi(typeahead(editor).ui);
    expect(key(editor, { key: 'ArrowDown' })).toBe(true);
    expect(typeahead(editor).state.value?.highlighted).toBe(1);
    expect(key(editor, { key: 'ArrowDown' })).toBe(true);
    expect(typeahead(editor).state.value?.highlighted).toBe(0);
    expect(key(editor, { key: 'ArrowUp' })).toBe(true);
    expect(key(editor, { key: 'Enter' })).toBe(true);
    expect(picked).toEqual(['a2']);
    expect(editor.getText()).toBe('Two');
    expect(typeahead(editor).state.value).toBeNull();
    // Escape closes for this trigger; it stays closed as the query grows.
    type(editor, ' +b');
    expect(key(editor, { key: 'Escape' })).toBe(true);
    expect(typeahead(editor).state.value).toBeNull();
    type(editor, 'c');
    expect(typeahead(editor).state.value).toBeNull();
    // A new trigger opens again; Tab picks.
    type(editor, ' +d');
    expect(key(editor, { key: 'Tab' })).toBe(true);
    expect(picked).toEqual(['a2', 'd1']);
    release();
  });

  it('debounces async searches and drops a stale answer', async () => {
    vi.useFakeTimers();
    const calls: Array<{ query: string; signal: AbortSignal; resolve: (v: unknown) => void }> = [];
    const editor = make([Typeahead]);
    addTypeaheadSources(editor, () => [
      {
        id: 'async',
        trigger: '+',
        label: 'Async',
        debounce: 100,
        search: (query, { signal }) =>
          new Promise((resolve) => {
            calls.push({ query, signal, resolve: resolve as (v: unknown) => void });
          }),
        select: () => {},
      },
    ]);
    caretAtEnd(editor);
    type(editor, '+a');
    type(editor, 'b');
    expect(typeahead(editor).state.value).toMatchObject({ loading: true, visible: true });
    vi.advanceTimersByTime(99);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls.map((c) => c.query)).toEqual(['ab']);
    type(editor, 'c');
    vi.advanceTimersByTime(100);
    expect(calls.map((c) => c.query)).toEqual(['ab', 'abc']);
    expect(calls[0]?.signal.aborted).toBe(true);
    calls[0]?.resolve([{ id: 'stale', label: 'Stale' }]);
    await vi.runAllTimersAsync();
    expect(typeahead(editor).state.value?.options).toEqual([]);
    calls[1]?.resolve([{ id: 'fresh', label: 'Fresh' }]);
    await vi.runAllTimersAsync();
    expect(typeahead(editor).state.value).toMatchObject({
      loading: false,
      options: [{ id: 'fresh', label: 'Fresh' }],
    });
  });

  it('an empty answer shows a message, or closes for a query with a space', async () => {
    const { editor } = withSource(
      vi.fn(() => []),
      true,
    );
    type(editor, '+zz');
    expect(typeahead(editor).state.value).toMatchObject({ options: [], visible: true });
    type(editor, ' q');
    expect(typeahead(editor).state.value?.visible).toBe(false);
  });

  it('does nothing while read-only', () => {
    const { editor } = withSource();
    editor.setEditable(false);
    type(editor, '+ab');
    expect(typeahead(editor).state.value).toBeNull();
  });
});

describe('Emoji', () => {
  const storage = (editor: TeiEditor) => editor.extension(Emoji)?.output.storage as EmojiStorage;

  it('parses its data: every shortcode once, every emoji once', () => {
    const set = parseEmojiData(EMOJI_DATA);
    expect(set.categories.map((c) => c.id)).toEqual([
      'people',
      'nature',
      'food',
      'activity',
      'travel',
      'objects',
      'symbols',
      'flags',
    ]);
    expect(set.all.length).toBeGreaterThan(400);
    expect(new Set(set.all.map((e) => e.emoji)).size).toBe(set.all.length);
    expect(set.byShortcode.get('smile')?.emoji).toBe('😄');
    expect(set.byShortcode.get('+1')?.emoji).toBe('👍');
    expect(set.byShortcode.get('thumbsup')?.emoji).toBe('👍');
    for (const emoji of set.all)
      for (const code of emoji.shortcodes) expect(code).toMatch(/^[\w+-]+$/);
  });

  it('ranks a shortcode prefix first, then a word in it, then search words', async () => {
    const set = await loadBuiltInEmoji();
    expect(searchEmoji(set, 'smile', 3).map((e) => e.name)).toEqual([
      'smile',
      'smiley',
      'smile_cat',
    ]);
    expect(searchEmoji(set, 'heart')[0]?.name).toBe('heart');
    expect(searchEmoji(set, 'tacos')).toEqual([]);
    expect(searchEmoji(set, 'yay').map((e) => e.name)).toContain('raised_hands');
  });

  it('`:smile:` turns into 😄 on the closing colon, as one undo step back', async () => {
    const editor = make([Emoji]);
    await storage(editor).load();
    caretAtEnd(editor);
    type(editor, 'hi :smile:');
    expect(editor.getText()).toBe('hi 😄');
    type(editor, '!');
    expect(editor.getText()).toBe('hi 😄!');
    expect(storage(editor).recent.value).toEqual(['😄']);
    // Unknown codes, codes mid-word and times stay as typed.
    type(editor, ' :nope: a:smile: 10:30:');
    expect(editor.getText()).toBe('hi 😄! :nope: a:smile: 10:30:');
  });

  it('leaves `:smile:` that undo or a collaborator brings back', async () => {
    const editor = make([Emoji], '<p>Hi</p>');
    await storage(editor).load();
    caretAtEnd(editor);
    for (const tag of [HISTORIC_TAG, COLLABORATION_TAG]) {
      editor.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(' :smile:');
        },
        { tag, discrete: true },
      );
    }
    expect(editor.getText()).toBe('Hi :smile: :smile:');
  });

  it('leaves `:smile:` alone in code, while composing, and with shortcodes off', async () => {
    // Typing at the end of inline code leaves it; a colon put inside it stays.
    const code = make([Emoji], '<p><code>x :smile</code></p>');
    await storage(code).load();
    code.update(() => {
      const node = $getRoot().getAllTextNodes()[0] as TextNode;
      node.select();
      node.spliceText(node.getTextContentSize(), 0, ':', true);
    });
    expect(code.getText()).toBe('x :smile:');

    const ime = make([Emoji]);
    caretAtEnd(ime);
    type(ime, ':smile');
    ime.update(() => {
      const node = $getRoot().getAllTextNodes()[0] as TextNode;
      $setCompositionKey(node.getKey());
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(':');
    });
    expect(ime.getText()).toBe(':smile:');
    expect(typeahead(ime).state.value).toBeNull();

    const off = make([Emoji.configure({ shortcodes: false })]);
    caretAtEnd(off);
    type(off, ':smile:');
    expect(off.getText()).toBe(':smile:');
  });

  it('`:sm` lists matches; Enter puts the emoji in', async () => {
    const editor = make([Emoji]);
    const release = holdUi(typeahead(editor).ui);
    caretAtEnd(editor);
    type(editor, 'a :s');
    expect(typeahead(editor).state.value).toBeNull();
    type(editor, 'mil');
    await flush();
    await storage(editor).load();
    await flush();
    const state = typeahead(editor).state.value;
    expect(state?.source).toBe('emoji');
    expect(state?.options[0]).toEqual({ id: 'smile', label: ':smile:', glyph: '😄' });
    expect(state?.options.length).toBeLessThanOrEqual(8);
    expect(key(editor, { key: 'Enter' })).toBe(true);
    expect(editor.getText()).toBe('a 😄');
    // A query nothing matches shows no list.
    type(editor, ' :zzq');
    expect(typeahead(editor).state.value?.visible).toBe(false);
    release();
  });

  it('insertEmoji types it and remembers it; recent is capped and reported', async () => {
    const onRecentChange = vi.fn();
    const editor = make([Emoji.configure({ recent: ['🎉'], maxRecent: 2, onRecentChange })]);
    caretAtEnd(editor);
    expect(storage(editor).recent.value).toEqual(['🎉']);
    editor.commands.insertEmoji('👍');
    editor.commands.insertEmoji('🔥');
    editor.commands.insertEmoji('👍');
    expect(editor.getText()).toBe('👍🔥👍');
    expect(storage(editor).recent.value).toEqual(['👍', '🔥']);
    expect(onRecentChange).toHaveBeenLastCalledWith(['👍', '🔥']);
  });

  it('openEmojiPicker asks the picker, only when one is there', () => {
    const editor = make([Emoji]);
    caretAtEnd(editor);
    expect(editor.can().openEmojiPicker()).toBe(false);
    expect(editor.commands.openEmojiPicker()).toBe(false);
    const release = holdUi(storage(editor).picker);
    expect(editor.commands.openEmojiPicker()).toBe(true);
    expect(storage(editor).picker.requests.value).toBe(1);
    expect(editor.items('toolbar').map((i) => i.id)).toContain('emoji');
    expect(editor.shortcut('emojiPicker')).toBeDefined();
    release();
  });
});

describe('Mention', () => {
  const PEOPLE: MentionItem[] = [
    { id: 'u1', label: 'Ada Lovelace', href: 'https://example.com/ada' },
    { id: 'u2', label: 'Alan Turing', avatar: 'https://example.com/a.png' },
    { id: 'u3', label: '<img src=x onerror=alert(1)>' },
  ];
  const search = (query: string) =>
    PEOPLE.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()));

  function people(options: Partial<MentionOptions> = {}, content?: string, markdown = false) {
    const editor = make(
      [Mention.configure({ search, debounce: 0, ...options })],
      content,
      markdown,
    );
    caretAtEnd(editor);
    return editor;
  }

  const mentions = (editor: TeiEditor) =>
    editor.read(() =>
      $getRoot()
        .getAllTextNodes()
        .filter($isMentionNode)
        .map((n) => n.getMention()),
    );

  it('`@` searches; a pick goes in as one atomic mention with a space after', async () => {
    const editor = people();
    const release = holdUi(typeahead(editor).ui);
    type(editor, 'Hi @ad');
    await flush();
    const state = typeahead(editor).state.value;
    expect(state?.options.map((o) => o.label)).toEqual(['Ada Lovelace']);
    expect(key(editor, { key: 'Enter' })).toBe(true);
    type(editor, 'x');
    expect(editor.getText()).toBe('Hi @Ada Lovelace x');
    expect(mentions(editor)).toEqual([
      { id: 'u1', label: 'Ada Lovelace', trigger: '@', href: 'https://example.com/ada' },
    ]);
    expect(editor.read(() => $getRoot().getAllTextNodes().find($isMentionNode)?.getMode())).toBe(
      'token',
    );
    release();
  });

  it('a query may have a space: "@alan tu"', async () => {
    const editor = people();
    const release = holdUi(typeahead(editor).ui);
    type(editor, '@alan tu');
    await flush();
    expect(typeahead(editor).state.value?.options.map((o) => o.id)).toEqual(['u2']);
    expect(typeahead(editor).state.value?.options[0]?.image).toBe('https://example.com/a.png');
    release();
  });

  it('HTML: a span (or a link with a safe href), read back; unsafe hrefs dropped', () => {
    const editor = people(
      {},
      '<p>Hi <span data-tei-mention="u2" data-label="Alan Turing">@Alan Turing</span> and <a href="https://example.com/ada" data-tei-mention="u1" data-label="Ada">@Ada</a> <a href="javascript:alert(1)" data-tei-mention="u9" data-label="Bad">@Bad</a></p>',
    );
    expect(editor.getHTML()).toBe(
      '<p>Hi <span data-tei-mention="u2" data-label="Alan Turing">@Alan Turing</span> and <a href="https://example.com/ada" data-tei-mention="u1" data-label="Ada">@Ada</a> <span data-tei-mention="u9" data-label="Bad">@Bad</span></p>',
    );
    expect(mentions(editor).map((m) => m.href)).toEqual([null, 'https://example.com/ada', null]);
    // JSON round trip keeps it.
    const again = people({}, editor.getJSON());
    expect(mentions(again)).toEqual(mentions(editor));
  });

  it('a hostile label stays text, everywhere', () => {
    const editor = people();
    editor.commands.insertMention(PEOPLE[2] as MentionItem);
    const html = editor.getHTML();
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(document.querySelector('img')).toBeNull();
    expect(editor.getMarkdown().trim()).toBe('@[<img src=x onerror=alert(1)>](mention:u3)');
  });

  it('markdown: `@[label](mention:id)` round-trips, other triggers and odd ids too', () => {
    const md =
      'Hi @[Ada \\[Countess\\]](mention:u1), see #[general](mention:c%2F1) and [a link](https://example.com)';
    const editor = people({}, md, true);
    expect(mentions(editor)).toEqual([
      { id: 'u1', label: 'Ada [Countess]', trigger: '@', href: null },
      { id: 'c/1', label: 'general', trigger: '#', href: null },
    ]);
    expect(editor.getMarkdown()).toBe(md);
    expect(editor.getHTML()).toContain('<a href="https://example.com">a link</a>');
    expect(editor.getHTML()).toContain('data-trigger="#"');
  });

  it('more triggers: `#` searches channels with its own search', async () => {
    const channels = vi.fn(() => [{ id: 'c1', label: 'general' }]);
    const editor = people({ triggers: [{ trigger: '#', search: channels }] });
    const release = holdUi(typeahead(editor).ui);
    type(editor, '#gen');
    await flush();
    expect(typeahead(editor).state.value?.source).toBe('mention:#');
    expect(channels).toHaveBeenCalledWith('gen', expect.objectContaining({ trigger: '#' }));
    key(editor, { key: 'Tab' });
    expect(mentions(editor)).toEqual([{ id: 'c1', label: 'general', trigger: '#', href: null }]);
    release();
  });

  it('startMention types the trigger, with a space before it mid-word', () => {
    const editor = people();
    type(editor, 'Hi');
    editor.commands.startMention();
    expect(editor.getText()).toBe('Hi @');
    expect(typeahead(editor).state.value?.source).toBe('mention:@');
    expect(
      people({ search: null })
        .items('slash')
        .some((i) => i.id === 'mention'),
    ).toBe(false);
    expect(editor.items('slash').some((i) => i.id === 'mention')).toBe(true);
  });

  it('a click on a mention calls onClick with it', () => {
    const onClick = vi.fn();
    const editor = people(
      { onClick },
      '<p><span data-tei-mention="u2" data-label="Alan">@Alan</span></p>',
    );
    const chip = editor.lexical
      .getRootElement()
      ?.querySelector('[data-tei-mention]') as HTMLElement;
    expect(chip.className).toContain('tei-mention');
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(onClick).toHaveBeenCalledWith(
      { id: 'u2', label: 'Alan', trigger: '@', href: null },
      expect.any(MouseEvent),
    );
  });

  it('options change live: a search added later works', async () => {
    const editor = people({ search: null });
    type(editor, '@a');
    expect(typeahead(editor).state.value).toBeNull();
    setExtensionOptions(editor, Mention, { search });
    type(editor, 'd');
    await flush();
    expect(typeahead(editor).state.value?.options.map((o) => o.id)).toEqual(['u1']);
  });
});

describe('Hashtag', () => {
  it('makes a chip as you type; saved as data-tei-hashtag and read back', () => {
    const editor = make([Hashtag]);
    caretAtEnd(editor);
    type(editor, 'ship #launch now');
    const chip = editor.lexical.getRootElement()?.querySelector('[data-tei-hashtag]');
    expect(chip?.textContent).toBe('#launch');
    expect(chip?.className).toContain('tei-hashtag');
    const html = editor.getHTML();
    expect(html).toBe('<p>ship <span data-tei-hashtag="">#launch</span> now</p>');
    const again = make([Hashtag], html);
    expect(again.getHTML()).toBe(html);
    expect(editor.getMarkdown()).toBe('ship #launch now');
    const md = make([Hashtag], 'ship #launch now', true);
    expect(md.getHTML()).toBe(html);
  });

  it('calls onClick with the tag', () => {
    const onClick = vi.fn();
    const editor = make([Hashtag.configure({ onClick })], '<p>#café</p>');
    const chip = editor.lexical
      .getRootElement()
      ?.querySelector('[data-tei-hashtag]') as HTMLElement;
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(onClick).toHaveBeenCalledWith('café', expect.any(MouseEvent));
  });
});
