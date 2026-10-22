import { $createLinkNode } from '@lexical/link';
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $setSelection,
  PASTE_TAG,
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  $isEmbedNode,
  EMBED,
  Embed,
  type EmbedNode,
  type EmbedProvider,
  type EmbedStorage,
  embedId,
  figma,
  loom,
  matchEmbed,
  vimeo,
  x,
  youtube,
} from '../../src/extensions/embed/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { createTeiEditor, setExtensionOptions, type TeiEditor } from '../../src/index.js';

const editors: TeiEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function make(content: unknown = '<p>Hello</p>') {
  const editor = createTeiEditor({
    extensions: [StarterKit, Embed],
    content,
    contentFormat: typeof content === 'string' ? undefined : 'json',
  });
  editors.push(editor);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.lexical.setRootElement(root);
  return editor;
}

const $embeds = () => $getRoot().getChildren().filter($isEmbedNode) as EmbedNode[];
const embeds = (editor: TeiEditor) =>
  editor.read(() => $embeds().map((node) => `${node.getProviderName()}:${node.getId()}`));
const endOf = (editor: TeiEditor) => editor.update(() => $getRoot().selectEnd());
const storage = (editor: TeiEditor) => editor.extension(Embed)?.output.storage as EmbedStorage;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (children: unknown[]) => ({ root: { type: 'root', version: 1, children } });

const VIDEO = 'dQw4w9WgXcQ';

describe('embed: providers read their links', () => {
  const cases: Array<[EmbedProvider, string, string | null]> = [
    [youtube, `https://www.youtube.com/watch?v=${VIDEO}`, VIDEO],
    [youtube, `https://youtu.be/${VIDEO}?t=90`, `${VIDEO}&t=90`],
    [youtube, `https://m.youtube.com/watch?v=${VIDEO}&t=1m30s`, `${VIDEO}&t=90`],
    [youtube, `https://www.youtube.com/shorts/${VIDEO}`, VIDEO],
    [youtube, `https://www.youtube-nocookie.com/embed/${VIDEO}?start=5`, `${VIDEO}&t=5`],
    [youtube, 'https://www.youtube.com/watch?v=short', null],
    [youtube, `https://evil.test/watch?v=${VIDEO}`, null],
    [youtube, `https://youtube.com.evil.test/watch?v=${VIDEO}`, null],
    [vimeo, 'https://vimeo.com/76979871', '76979871'],
    [vimeo, 'https://vimeo.com/76979871/abcdef1234', '76979871/abcdef1234'],
    [vimeo, 'https://player.vimeo.com/video/76979871?h=abcdef1234', '76979871/abcdef1234'],
    [vimeo, 'https://vimeo.com/channels/staffpicks/76979871', '76979871'],
    [vimeo, 'https://vimeo.com/about', null],
    [x, 'https://x.com/jack/status/20', '20'],
    [x, 'https://twitter.com/jack/status/20?s=20', '20'],
    [x, 'https://mobile.twitter.com/i/web/status/20', '20'],
    [x, 'https://platform.twitter.com/embed/Tweet.html?id=20', '20'],
    [x, 'https://x.com/jack', null],
    [
      figma,
      'https://www.figma.com/design/abcdefghij1234/Name?node-id=1-2',
      'design/abcdefghij1234?node-id=1-2',
    ],
    [figma, 'https://www.figma.com/file/abcdefghij1234', 'file/abcdefghij1234'],
    [
      figma,
      `https://www.figma.com/embed?embed_host=x&url=${encodeURIComponent('https://www.figma.com/proto/abcdefghij1234/P')}`,
      'proto/abcdefghij1234',
    ],
    [figma, 'https://www.figma.com/community/file/1', null],
    [loom, `https://www.loom.com/share/${'a'.repeat(32)}`, 'a'.repeat(32)],
    [loom, 'https://www.loom.com/share/zz', null],
  ];
  it.each(cases)('%s: %s', (provider, link, id) => {
    expect(provider.match(new URL(link))).toBe(id);
    // Every id reads back from its page's link.
    if (id) expect(embedId(provider, id)).toBe(id);
  });

  it('frames from their own hosts only, built from the id', () => {
    expect(youtube.src(`${VIDEO}&t=90`, { theme: 'light' })).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO}?start=90`,
    );
    expect(x.src('20', { theme: 'dark' })).toBe(
      'https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true&theme=dark',
    );
    expect(figma.src('design/abcdefghij1234?node-id=1-2', { theme: 'light' })).toBe(
      'https://www.figma.com/embed?embed_host=teieditor&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2Fabcdefghij1234%3Fnode-id%3D1-2',
    );
    expect(vimeo.src('76979871/abcdef1234', { theme: 'light' })).toBe(
      'https://player.vimeo.com/video/76979871?h=abcdef1234&dnt=1',
    );
  });

  it('an id that does not read back is refused, whatever it holds', () => {
    for (const id of ['"><script>', `${VIDEO}?autoplay=1`, `../${VIDEO}`, '', 'x'.repeat(600), 7]) {
      expect(embedId(youtube, id)).toBeNull();
    }
    expect(embedId(x, '20/../../evil')).toBeNull();
    expect(embedId(figma, 'design/abcdefghij1234?node-id=1-2&x=<')).toBeNull();
  });

  it('matchEmbed tries each provider, http(s) links only', () => {
    expect(matchEmbed([youtube, x], 'https://x.com/a/status/5')?.provider).toBe(x);
    expect(matchEmbed([youtube], 'javascript:alert(1)')).toBeNull();
    expect(matchEmbed([youtube], 'not a link')).toBeNull();
  });

  it('X reports its height through a message from its own origin', () => {
    const message = (origin: string, data: unknown) =>
      new MessageEvent('message', { origin, data });
    const resize = {
      'twttr.embed': { method: 'twttr.private.resize', params: [{ height: 412.5 }] },
    };
    expect(x.resize?.(message('https://platform.twitter.com', JSON.stringify(resize)))).toBe(413);
    expect(x.resize?.(message('https://platform.twitter.com', resize))).toBe(413);
    expect(x.resize?.(message('https://evil.test', resize))).toBeNull();
    expect(x.resize?.(message('https://platform.twitter.com', '{bad'))).toBeNull();
    expect(
      x.resize?.(message('https://platform.twitter.com', { 'twttr.embed': { method: 'other' } })),
    ).toBeNull();
  });
});

const SAVED = `<iframe title="YouTube video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen="" src="https://www.youtube-nocookie.com/embed/${VIDEO}" data-tei-embed="youtube" data-id="${VIDEO}" width="640" height="360"></iframe>`;

describe('embed: JSON, HTML, Markdown', () => {
  it('saves as a sandboxed <iframe data-tei-embed>, and reads it back', () => {
    const editor = make(SAVED);
    expect(embeds(editor)).toEqual([`youtube:${VIDEO}`]);
    expect(editor.getHTML()).toBe(SAVED);
    expect(editor.getJSON()).toMatchObject(
      json([{ type: 'embed', provider: 'youtube', id: VIDEO }]),
    );
    expect(make(editor.getJSON()).getHTML()).toBe(SAVED);
  });

  it('reads any provider’s own embed code: its iframe, and X’s quote', () => {
    const iframe = make(
      `<iframe src="https://player.vimeo.com/video/76979871" width="640"></iframe>`,
    );
    expect(embeds(iframe)).toEqual(['vimeo:76979871']);
    const tweet = make(
      '<blockquote class="twitter-tweet"><p>Hi</p>&mdash; Jack (@jack) <a href="https://twitter.com/jack/status/20?ref_src=twsrc">March 21, 2006</a></blockquote>',
    );
    expect(embeds(tweet)).toEqual(['x:20']);
    // A frame no provider reads is dropped.
    expect(embeds(make('<iframe src="https://evil.test/frame"></iframe><p>x</p>'))).toEqual([]);
  });

  it('alignment: saved when not centred', () => {
    const editor = make(SAVED.replace('data-id', 'data-align="end" data-id'));
    expect(editor.getJSON()).toMatchObject(json([{ type: 'embed', align: 'end' }]));
    expect(editor.getHTML()).toContain('data-align="end"');
  });

  it('a hostile id from JSON never reaches a frame', () => {
    const editor = make(
      json([
        { type: 'embed', version: 1, provider: 'youtube', id: '"><img src=x onerror=alert(1)>' },
      ]),
    );
    const box = editor.lexical.getRootElement()?.querySelector('.tei-embed');
    expect(box?.querySelector('iframe')).toBeNull();
    expect(box?.hasAttribute('data-unknown')).toBe(true);
    expect(box?.textContent).toBe('Embedded content that cannot be shown here');
    // Kept as it was, for no harm: it is never used.
    expect(editor.getHTML()).not.toContain('<img');
  });

  it('a provider not installed: kept, and back once it is', () => {
    const saved = json([{ type: 'embed', version: 1, provider: 'acme', id: '42' }]);
    const editor = make(saved);
    expect(editor.getHTML()).toBe('<div data-tei-embed="acme" data-id="42"></div>');
    const acme: EmbedProvider = {
      name: 'acme',
      label: 'Acme',
      title: 'Acme clip',
      match: (url) =>
        url.hostname === 'acme.test' ? (/^\/clip\/(\d+)$/.exec(url.pathname)?.[1] ?? null) : null,
      src: (id) => `https://acme.test/frame/${id}`,
      url: (id) => `https://acme.test/clip/${id}`,
    };
    const custom = createTeiEditor({
      extensions: [StarterKit, Embed.configure({ providers: [acme] })],
      content: editor.getHTML(),
    });
    editors.push(custom);
    expect(custom.getHTML()).toContain('src="https://acme.test/frame/42" data-tei-embed="acme"');
  });

  it('Markdown: its page’s link on a line of its own, both ways', () => {
    const editor = make(SAVED);
    expect(editor.getMarkdown()).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
    editor.setContent(
      `Before\n\nhttps://x.com/jack/status/20\n\nhttps://example.com/page\n\nAfter`,
      'markdown',
    );
    expect(embeds(editor)).toEqual(['x:20']);
    expect(editor.getText()).toContain('https://example.com/page');
    expect(EMBED.regExp.test('https://x.com/jack/status/20 ')).toBe(false);
  });

  it('with consent, saved HTML holds the address back in data-src', () => {
    const editor = createTeiEditor({
      extensions: [StarterKit, Embed.configure({ consent: true })],
      content: SAVED,
    });
    editors.push(editor);
    const html = editor.getHTML();
    expect(html).toContain(`data-src="https://www.youtube-nocookie.com/embed/${VIDEO}"`);
    expect(html).not.toContain(' src=');
    // And reads back.
    expect(make(html).getHTML()).toBe(SAVED);
  });

  it('inside a paragraph, it splits it', () => {
    const iframe = `<iframe src="https://www.youtube.com/embed/${VIDEO}"></iframe>`;
    const editor = make(`<p>One ${iframe} two</p>`);
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => n.getType()),
      ),
    ).toEqual(['paragraph', 'embed', 'paragraph']);
  });
});

describe('embed: in the editor', () => {
  it('the frame gets its address once in the page, sized through the CSSOM', () => {
    const editor = make(SAVED);
    const box = editor.lexical.getRootElement()?.querySelector('.tei-embed') as HTMLElement;
    expect(box.getAttribute('data-tei-embed')).toBe('youtube');
    expect(box.getAttribute('contenteditable')).toBe('false');
    const iframe = box.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(`https://www.youtube-nocookie.com/embed/${VIDEO}`);
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(box.hasAttribute('style')).toBe(false);
    const frame = box.querySelector('.tei-embed-frame') as HTMLElement;
    // 16/9 by default, from the stylesheet; a provider's own, through the CSSOM.
    expect(frame.style.getPropertyValue('--tei-embed-ratio')).toBe('');
    const square = createTeiEditor({
      extensions: [StarterKit, Embed.configure({ providers: [{ ...youtube, aspect: 1 }] })],
      content: SAVED,
    });
    editors.push(square);
    const root = document.createElement('div');
    document.body.append(root);
    square.lexical.setRootElement(root);
    const squareFrame = root.querySelector('.tei-embed-frame') as HTMLElement;
    expect(squareFrame.style.getPropertyValue('--tei-embed-ratio')).toBe('1');
  });

  it('X: in the editor’s colour scheme, as tall as the post says', () => {
    const editor = make('<p>x</p>');
    endOf(editor);
    const root = editor.lexical.getRootElement() as HTMLElement;
    root.style.colorScheme = 'dark';
    editor.commands.insertEmbed('https://x.com/jack/status/20');
    const box = root.querySelector('[data-tei-embed="x"]') as HTMLElement;
    const iframe = box.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('theme=dark');
    const frame = box.querySelector('.tei-embed-frame') as HTMLElement;
    expect(frame.style.getPropertyValue('--tei-embed-height')).toBe('320px');
    expect(frame.style.getPropertyValue('--tei-embed-max')).toBe('550px');
    const data = JSON.stringify({
      'twttr.embed': { method: 'twttr.private.resize', params: [{ height: 600 }] },
    });
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://platform.twitter.com',
        data,
        source: iframe.contentWindow,
      }),
    );
    expect(frame.style.getPropertyValue('--tei-embed-height')).toBe('600px');
    // From another frame, nothing changes.
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://platform.twitter.com', data, source: window }),
    );
    expect(frame.style.getPropertyValue('--tei-embed-height')).toBe('600px');
  });

  it('with consent, a button loads the frame, and nothing before', () => {
    const editor = createTeiEditor({
      extensions: [StarterKit, Embed.configure({ consent: true })],
      content: SAVED,
    });
    editors.push(editor);
    const root = document.createElement('div');
    document.body.append(root);
    editor.lexical.setRootElement(root);
    const iframe = root.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.hasAttribute('src')).toBe(false);
    expect(iframe.hidden).toBe(true);
    const button = root.querySelector('[data-tei-embed-load]') as HTMLButtonElement;
    expect(button.textContent).toBe('Load YouTube videoContent from www.youtube-nocookie.com');
    button.click();
    expect(iframe.getAttribute('src')).toBe(`https://www.youtube-nocookie.com/embed/${VIDEO}`);
    expect(iframe.hidden).toBe(false);
    expect(root.querySelector('[data-tei-embed-load]')).toBeNull();
  });

  it('its text is its page’s link', () => {
    expect(make(SAVED).getText()).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
  });
});

describe('embed: commands', () => {
  it('insertEmbed at the caret, refusing a link no provider reads', () => {
    const editor = make();
    endOf(editor);
    expect(editor.can().insertEmbed('https://example.com')).toBe(false);
    expect(editor.commands.insertEmbed('https://example.com')).toBe(false);
    expect(editor.commands.insertEmbed(`https://youtu.be/${VIDEO}`, 'start')).toBe(true);
    expect(embeds(editor)).toEqual([`youtube:${VIDEO}`]);
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => n.getType()),
      ),
    ).toEqual(['paragraph', 'embed', 'paragraph']);
    expect(editor.read(() => $embeds()[0]?.getAlign())).toBe('start');
  });

  it('align and remove the selected embed', () => {
    const editor = make(`<p>a</p>${SAVED}<p>b</p>`);
    expect(editor.can().removeEmbed()).toBe(false);
    editor.update(() => {
      const selection = $createNodeSelection();
      selection.add(($embeds()[0] as EmbedNode).getKey());
      $setSelection(selection);
    });
    expect(editor.isActive('embed')).toBe(true);
    expect(editor.isActive('embedAlign', 'center')).toBe(true);
    editor.commands.setEmbedAlign('end');
    expect(editor.isActive('embedAlign', 'end')).toBe(true);
    expect(editor.commands.setEmbedAlign('sideways' as never)).toBe(false);
    editor.commands.removeEmbed();
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p>');
  });

  it('openEmbedInsert asks a UI, for one provider or any; with none, it cannot', () => {
    const editor = make();
    endOf(editor);
    expect(editor.can().openEmbedInsert()).toBe(false);
    expect(editor.commands.openEmbedInsert()).toBe(false);
    const { insert, insertProvider } = storage(editor);
    insert.uis.value = 1;
    expect(editor.commands.openEmbedInsert('x')).toBe(true);
    expect(insertProvider.peek()).toBe('x');
    expect(insert.requests.peek()).toBe(1);
    editor.commands.openEmbedInsert();
    expect(insertProvider.peek()).toBeNull();
  });

  it('per-provider items, while the provider is installed', () => {
    const ids = (editor: TeiEditor) =>
      editor
        .items('slash')
        .map((item) => item.id)
        .filter((id) => id.startsWith('embed'));
    expect(ids(make())).toEqual([
      'embed.youtube',
      'embed.vimeo',
      'embed.x',
      'embed.figma',
      'embed.loom',
    ]);
    const editor = make();
    setExtensionOptions(editor, Embed, { providers: [x] });
    expect(ids(editor)).toEqual(['embed.x']);
    expect(
      make()
        .items('embedMenu')
        .map((item) => item.id),
    ).toEqual([
      'embedAlign.start',
      'embedAlign.center',
      'embedAlign.end',
      'embedOpen',
      'embedCopy',
      'removeEmbed',
    ]);
  });
});

describe('embed: a link pasted on its own', () => {
  const paste = (editor: TeiEditor, url: string, text = url) =>
    editor.lexical.update(
      () => {
        $getSelection()?.insertNodes([$createLinkNode(url).append($createTextNode(text))]);
      },
      { tag: PASTE_TAG, discrete: true },
    );
  const line = (editor: TeiEditor) =>
    editor.update(() => {
      const p = $createParagraphNode();
      $getRoot().append(p);
      p.select();
    });

  it('marks the offered link, for other UI on it to make way', () => {
    const editor = make();
    line(editor);
    paste(editor, `https://www.youtube.com/watch?v=${VIDEO}`);
    const key = storage(editor).suggestion.peek()?.key as string;
    const link = editor.lexical.getElementByKey(key);
    expect(link?.hasAttribute('data-tei-offer')).toBe(true);
    storage(editor).suggestion.value = null;
    expect(link?.hasAttribute('data-tei-offer')).toBe(false);
  });

  it('ask (the default): offers to embed it; embedLink takes the offer', () => {
    const editor = make();
    line(editor);
    paste(editor, `https://www.youtube.com/watch?v=${VIDEO}`);
    const offer = storage(editor).suggestion.peek();
    expect(offer?.provider.name).toBe('youtube');
    expect(offer?.id).toBe(VIDEO);
    expect(embeds(editor)).toEqual([]);
    expect(editor.can().embedLink()).toBe(true);
    editor.commands.embedLink();
    expect(embeds(editor)).toEqual([`youtube:${VIDEO}`]);
    expect(storage(editor).suggestion.peek()).toBeNull();
    // The paragraph it was alone in became the embed.
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => n.getType()),
      ),
    ).toEqual(['paragraph', 'embed', 'paragraph']);
    editor.commands.undo();
    expect(embeds(editor)).toEqual([]);
    expect(editor.getText()).toContain(`https://www.youtube.com/watch?v=${VIDEO}`);
  });

  it('in a line of text, the line splits round the embed', () => {
    const editor = make('<p>See</p>');
    endOf(editor);
    editor.update(() => $getSelection()?.insertText(' '));
    paste(editor, 'https://x.com/jack/status/20');
    const key = storage(editor).suggestion.peek()?.key;
    editor.update(() => $getSelection()?.insertText(' here'));
    // Typing on declined the offer; the link can still be embedded by its key.
    expect(storage(editor).suggestion.peek()).toBeNull();
    expect(editor.commands.embedLink()).toBe(false);
    editor.commands.embedLink(key);
    expect(
      editor.read(() =>
        $getRoot()
          .getChildren()
          .map((n) => `${n.getType()}:${n.getTextContent().trim()}`),
      ),
    ).toEqual(['paragraph:See', 'embed:https://x.com/i/status/20', 'paragraph:here']);
  });

  it('typing on declines the offer; a selection move keeps it', () => {
    const editor = make();
    line(editor);
    paste(editor, 'https://x.com/jack/status/20');
    editor.update(() => $getRoot().selectStart());
    expect(storage(editor).suggestion.peek()).not.toBeNull();
    editor.update(() => $getSelection()?.insertText('a'));
    expect(storage(editor).suggestion.peek()).toBeNull();
  });

  it('the offer goes once the link changes or goes', () => {
    const editor = make();
    line(editor);
    paste(editor, 'https://x.com/jack/status/20');
    expect(storage(editor).suggestion.peek()).not.toBeNull();
    editor.update(() => $getRoot().getLastChild()?.remove());
    expect(storage(editor).suggestion.peek()).toBeNull();
  });

  it('no offer for a link with words of its own, typed rather than pasted, or one no provider reads', () => {
    const editor = make();
    line(editor);
    paste(editor, 'https://x.com/jack/status/20', 'a post');
    paste(editor, 'https://example.com/page');
    editor.update(() => {
      $getSelection()?.insertNodes([
        $createLinkNode('https://x.com/jack/status/20').append(
          $createTextNode('https://x.com/jack/status/20'),
        ),
      ]);
    });
    expect(storage(editor).suggestion.peek()).toBeNull();
  });

  it('always: embeds it at once; never: keeps the link', async () => {
    const always = make();
    setExtensionOptions(always, Embed, { autoEmbed: 'always' });
    // A listener that reads, as <EditorContent>'s placeholder does, while the
    // embed waits its turn behind the paste.
    const reads: boolean[] = [];
    always.lexical.registerUpdateListener(() => reads.push(always.isEmpty));
    line(always);
    paste(always, `https://youtu.be/${VIDEO}`);
    await flush();
    expect(embeds(always)).toEqual([`youtube:${VIDEO}`]);
    expect(reads.at(-1)).toBe(false);
    const never = make();
    setExtensionOptions(never, Embed, { autoEmbed: 'never' });
    line(never);
    paste(never, `https://youtu.be/${VIDEO}`);
    await flush();
    expect(embeds(never)).toEqual([]);
    expect(storage(never).suggestion.peek()).toBeNull();
  });
});
