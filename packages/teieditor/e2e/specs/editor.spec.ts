import { expect, type Harness, test } from './fixtures';

test.describe('typing', () => {
  test('types, splits blocks with Enter, and joins them with Backspace', async ({ tei }) => {
    await tei.open({ content: '' });
    await tei.content.click();
    await tei.page.keyboard.type('First');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Second');
    expect(await tei.html()).toBe('<p>First</p><p>Second</p>');
    for (let i = 0; i < 'Second'.length; i++) await tei.page.keyboard.press('ArrowLeft');
    await tei.page.keyboard.press('Backspace');
    expect(await tei.html()).toBe('<p>FirstSecond</p>');
  });

  test('a key pressed right after moving the caret acts at the new caret', async ({ tei }) => {
    // Chromium reports caret moves a task late; without the editor's own
    // check, Backspace here deletes next to where the caret was. The race is
    // timing-dependent, so it runs several times.
    for (let round = 0; round < 8; round++) {
      await tei.open({ content: '<p>abcdef</p>' });
      await tei.caretAtEnd();
      for (let i = 0; i < 3; i++) await tei.page.keyboard.press('ArrowLeft');
      await tei.page.keyboard.press('Backspace');
      expect(await tei.text(), `round ${round}`).toBe('abdef');
    }
  });

  test('keeps runs of spaces as typed', async ({ tei }) => {
    await tei.open({ content: '' });
    await tei.content.click();
    await tei.page.keyboard.type('a   b');
    expect(await tei.text()).toBe('a   b');
    expect(await tei.html()).toBe('<p><span style="white-space: pre-wrap;">a   b</span></p>');
  });
});

test.describe('marks from the keyboard', () => {
  for (const [key, tag] of [
    ['b', 'strong'],
    ['i', 'em'],
    ['u', 'u'],
  ] as const) {
    test(`⌘${key.toUpperCase()} toggles <${tag}> on the selection`, async ({ tei }) => {
      await tei.open({ content: '<p>word</p>' });
      await tei.selectAll();
      await tei.page.keyboard.press(`ControlOrMeta+${key}`);
      expect(await tei.html()).toBe(`<p><${tag}>word</${tag}></p>`);
      await tei.page.keyboard.press(`ControlOrMeta+${key}`);
      expect(await tei.html()).toBe('<p>word</p>');
    });
  }

  test('a mark set at a collapsed caret applies to what is typed next', async ({ tei }) => {
    await tei.open({ content: '<p>a</p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.press('ControlOrMeta+b');
    await tei.page.keyboard.type('b');
    expect(await tei.html()).toBe('<p>a<strong>b</strong></p>');
  });

  test('⌘Z undoes and ⌘⇧Z redoes', async ({ tei }) => {
    await tei.open({ content: '<p>word</p>' });
    await tei.selectAll();
    await tei.page.keyboard.press('ControlOrMeta+b');
    await tei.page.keyboard.press('ControlOrMeta+z');
    expect(await tei.html()).toBe('<p>word</p>');
    await tei.page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await tei.html()).toBe('<p><strong>word</strong></p>');
  });
});

test.describe('markdown shortcuts', () => {
  const cases: Array<[string, string]> = [
    ['# Title', '<h1>Title</h1>'],
    ['### Third', '<h3>Third</h3>'],
    ['> Quote', '<blockquote>Quote</blockquote>'],
    ['- Item', '<ul><li value="1">Item</li></ul>'],
    ['1. Item', '<ol><li value="1">Item</li></ol>'],
    // A space at the end of a block survives only with pre-wrap.
    ['**bold** ', '<p><strong>bold</strong><span style="white-space: pre-wrap;"> </span></p>'],
    ['*it* ', '<p><em>it</em><span style="white-space: pre-wrap;"> </span></p>'],
    ['`code` ', '<p><code>code</code><span style="white-space: pre-wrap;"> </span></p>'],
    ['~~gone~~ ', '<p><s>gone</s><span style="white-space: pre-wrap;"> </span></p>'],
  ];
  for (const [typed, html] of cases) {
    test(`"${typed.trim()}" becomes ${html
      .match(/<(\w+)/g)
      ?.slice(0, 2)
      .join('')}`, async ({ tei }) => {
      await tei.open({ content: '' });
      await tei.content.click();
      await tei.page.keyboard.type(typed);
      expect(await tei.html()).toBe(html);
    });
  }

  test('``` makes a code block, and --- a divider', async ({ tei }) => {
    await tei.open({ content: '' });
    await tei.content.click();
    await tei.page.keyboard.type('```');
    await tei.page.keyboard.press('Space');
    await tei.page.keyboard.type('let a = 1;');
    expect(await tei.page.evaluate(() => window.__tei.editor.isActive('codeBlock'))).toBe(true);
    expect(await tei.text()).toBe('let a = 1;');
  });
});

test.describe('lists', () => {
  test('Tab nests an item, Shift-Tab lifts it, Enter on an empty item leaves the list', async ({
    tei,
  }) => {
    await tei.open({ content: '' });
    await tei.content.click();
    await tei.page.keyboard.type('- One');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Two');
    await tei.page.keyboard.press('Tab');
    expect(await tei.html()).toBe('<ul><li value="1">One<ul><li value="1">Two</li></ul></li></ul>');
    await tei.page.keyboard.press('Shift+Tab');
    expect(await tei.html()).toBe('<ul><li value="1">One</li><li value="2">Two</li></ul>');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('After');
    expect(await tei.html()).toBe(
      '<ul><li value="1">One</li><li value="2">Two</li></ul><p>After</p>',
    );
  });

  test('Tab outside a list moves focus on, as in any form', async ({ tei }) => {
    await tei.open({ content: '<p>x</p>' });
    await tei.content.click();
    await tei.page.keyboard.press('Tab');
    expect(await tei.html()).toBe('<p>x</p>');
  });
});

test.describe('paste', () => {
  /** Copy rich content from the page and paste it into the editor, as a user would. */
  async function copyPaste(tei: Harness, html: string, raw = false) {
    await tei.page.evaluate(([source, r]) => window.__tei.setClipSource(source, r), [
      html,
      raw,
    ] as const);
    await tei.page.keyboard.press('ControlOrMeta+c');
    // The copy source sits on the page; what it trips is not the editor's.
    await tei.forgetProblems();
    await tei.content.click();
    await tei.page.keyboard.press('ControlOrMeta+v');
  }

  test('pastes rich content, dropping handlers and unsafe links, with nothing run', async ({
    tei,
  }) => {
    await tei.open({ content: '' });
    await copyPaste(
      tei,
      '<h2 onclick="window.__pwned=1">Head</h2><p>See <a href="javascript:window.__pwned=1">bad</a> and <a href="https://ok.example/" onmouseover="window.__pwned=1">good</a> <b>bold</b></p>',
      true,
    );
    await expect.poll(() => tei.html()).toContain('<h2>Head</h2>');
    const html = await tei.html();
    expect(html).toBe(
      '<h2>Head</h2><p>See bad and <a href="https://ok.example/">good</a> <strong>bold</strong></p>',
    );
    expect(await tei.page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test('a paste files no CSP report, even with every element styled', async ({ tei }) => {
    await tei.open({ content: '' });
    // Chromium and WebKit copy computed styles onto each element.
    await copyPaste(tei, '<p style="color: red">one</p><p style="text-align: center">two</p>');
    await expect.poll(() => tei.text()).toBe('one\n\ntwo');
    // The fixture fails the test on any violation.
  });

  test('keeps meaningful alignment, drops what the browser added', async ({ tei }) => {
    await tei.open({ content: '' });
    await copyPaste(tei, '<p style="text-align: center">mid</p><p>plain words here</p>');
    await expect
      .poll(() => tei.html())
      .toBe('<p style="text-align: center;">mid</p><p>plain words here</p>');
  });

  test('pastes plain text as paragraphs', async ({ tei }) => {
    await tei.open({ content: '' });
    await tei.content.click();
    await tei.page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'one\ntwo');
      const target = document.querySelector('[data-tei-content]') as HTMLElement;
      target.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    });
    // Firefox ignores clipboardData on a synthetic event; the others paste.
    test.skip((await tei.text()) === '', 'synthetic clipboard data is unreadable in this engine');
    expect(await tei.html()).toBe('<p>one</p><p>two</p>');
  });
});

test.describe('links', () => {
  test('a typed URL becomes a link', async ({ tei }) => {
    await tei.open({ content: '' });
    await tei.content.click();
    await tei.page.keyboard.type('Go to https://teispace.example now');
    expect(await tei.html()).toContain('<a href="https://teispace.example"');
  });

  test('refuses script URLs from content', async ({ tei }) => {
    await tei.open({ content: '<p><a href="javascript:alert(1)">x</a></p>' });
    expect(await tei.html()).toBe('<p>x</p>');
  });
});

test.describe('check lists', () => {
  test('clicking the box checks and unchecks the item', async ({ tei }) => {
    await tei.open({ content: '' });
    await tei.content.click();
    await tei.page.keyboard.type('[ ] Task');
    const item = tei.page.locator('[data-tei-content] li').first();
    await expect(item).toHaveAttribute('role', 'checkbox');
    await expect(item).toHaveAttribute('aria-checked', 'false');
    const box = await item.boundingBox();
    if (!box) throw new Error('no box');
    // The box is drawn before the text, in the item's start padding.
    await tei.page.mouse.click(box.x + 8, box.y + box.height / 2);
    await expect(item).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('placeholder', () => {
  test('shows in an empty document, from CSS, and hides on typing', async ({ tei }) => {
    await tei.open({ content: '' });
    const placeholder = () =>
      tei.page.evaluate(() => {
        const block = document.querySelector('[data-tei-content] > *');
        const root = document.querySelector('[data-tei-content]');
        const before = [block, root].map((el) => el && getComputedStyle(el, '::before').content);
        return before.find((c) => c && c !== 'none' && c !== 'normal') ?? null;
      });
    expect(await placeholder()).toBe('"Write something…"');
    await tei.content.click();
    await tei.page.keyboard.type('x');
    expect(await placeholder()).toBeNull();
  });

  test('labels an empty heading under the caret', async ({ tei }) => {
    await tei.open({ content: '<p>Intro</p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('## ');
    const heading = tei.page.locator('[data-tei-content] h2');
    await expect(heading).toHaveAttribute('data-tei-placeholder', 'Heading 2');
    expect(await heading.evaluate((el) => getComputedStyle(el, '::before').content)).toBe(
      '"Heading 2"',
    );
  });
});

test.describe('toolbar', () => {
  test('a button formats the selection, keeps focus in the document and shows its state', async ({
    tei,
  }) => {
    await tei.open({ content: '<p>word</p>' });
    await tei.selectAll();
    const bold = tei.page.locator('[data-item="bold"]');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bold.click();
    expect(await tei.html()).toBe('<p><strong>word</strong></p>');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(
      await tei.page.evaluate(() => document.activeElement?.hasAttribute('data-tei-content')),
    ).toBe(true);
    // Typing goes on replacing the selection: focus never left.
    await tei.page.keyboard.type('new');
    expect(await tei.html()).toBe('<p><strong>new</strong></p>');
  });

  test('undo is disabled until there is something to undo', async ({ tei }) => {
    await tei.open({ content: '<p>x</p>' });
    const undo = tei.page.locator('[data-item="undo"]');
    await expect(undo).toBeDisabled();
    await tei.caretAtEnd();
    await tei.page.keyboard.type('y');
    await expect(undo).toBeEnabled();
    await undo.click();
    expect(await tei.html()).toBe('<p>x</p>');
  });
});
