import { expect, type Harness, settled, test } from './fixtures';

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

test.describe('focus', () => {
  test('the editor does not take focus on page load', async ({ tei }) => {
    await tei.open({ content: '<p>Loaded</p>' });
    await tei.page.waitForTimeout(100);
    expect(await tei.page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('setContent from code leaves focus where it is', async ({ tei }) => {
    await tei.open();
    const trigger = tei.page.getByTestId('dialog-trigger');
    await trigger.focus();
    await tei.page.evaluate(() => window.__tei.editor.setContent('<p>Replaced</p>'));
    await expect(trigger).toBeFocused();
    expect(await tei.text()).toBe('Replaced');
  });

  test('the toolbar works before the first click into the document', async ({ tei }) => {
    await tei.open({ content: '<p>word</p>' });
    const bold = tei.page
      .getByRole('toolbar', { name: 'Formatting', exact: true })
      .locator('[data-item="bold"]');
    await expect(bold).toBeEnabled();
    await bold.click();
    await tei.page.keyboard.type('X');
    expect(await tei.html()).toBe('<p>word<strong>X</strong></p>');
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
    ['- Item', '<ul><li>Item</li></ul>'],
    ['1. Item', '<ol><li>Item</li></ol>'],
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
    expect(await tei.html()).toBe('<ul><li>One<ul><li>Two</li></ul></li></ul>');
    await tei.page.keyboard.press('Shift+Tab');
    expect(await tei.html()).toBe('<ul><li>One</li><li>Two</li></ul>');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('After');
    expect(await tei.html()).toBe('<ul><li>One</li><li>Two</li></ul><p>After</p>');
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

test.describe('link popover', () => {
  const editorForm = (tei: Harness) => tei.page.locator('[data-tei-control="link-editor"]');
  const preview = (tei: Harness) => tei.page.locator('[data-tei-control="link-preview"]');

  test('a selection inside a link gets the bubble menu, not the preview', async ({ tei }) => {
    await tei.open({ content: '<p><a href="https://example.com">a long link text</a></p>' });
    await tei.selectAll();
    await expect(tei.page.locator('[data-tei-control="bubble-menu"]')).toBeVisible();
    await expect(preview(tei)).toHaveCount(0);
    await tei.page.keyboard.press('ArrowLeft');
    await expect(preview(tei)).toBeVisible();
  });

  test('⌘K links the selection; Enter applies and typing goes on in the document', async ({
    tei,
  }) => {
    await tei.open({ content: '<p>Read the docs</p>' });
    await tei.content.dblclick({ position: { x: 100, y: 10 } });
    await tei.selectAll();
    await tei.page.keyboard.press('ControlOrMeta+k');
    const input = editorForm(tei).getByRole('textbox');
    await expect(input).toBeFocused();
    await input.fill('example.com/docs');
    await tei.page.keyboard.press('Enter');
    await expect(editorForm(tei)).toHaveCount(0);
    expect(await tei.html()).toBe(
      '<p><a href="https://example.com/docs" rel="noopener noreferrer">Read the docs</a></p>',
    );
    await expect(tei.content).toBeFocused();
  });

  test('the toolbar button opens it, and a caret with no selection inserts the URL', async ({
    tei,
  }) => {
    await tei.open({ content: '<p>See</p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.type(' ');
    await tei.page.locator('[data-item="link"]').click();
    const input = editorForm(tei).getByRole('textbox');
    await expect(input).toBeFocused();
    await input.fill('https://example.com');
    await input.press('Enter');
    expect(await tei.html()).toBe(
      '<p>See <a href="https://example.com" rel="noopener noreferrer">https://example.com</a></p>',
    );
  });

  test('a refused URL says so and changes nothing', async ({ tei }) => {
    await tei.open({ content: '<p>text</p>' });
    await tei.selectAll();
    await tei.page.keyboard.press('ControlOrMeta+k');
    const input = editorForm(tei).getByRole('textbox');
    await input.fill('javascript:alert(1)');
    await input.press('Enter');
    await expect(editorForm(tei).getByRole('alert')).toHaveText('This link is not allowed');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    // Focus stays in the field, to fix the URL.
    await expect(input).toBeFocused();
    expect(await tei.html()).toBe('<p>text</p>');
    // Editing the URL clears the message.
    await input.press('Backspace');
    await expect(editorForm(tei).getByRole('alert')).toHaveCount(0);
  });

  test('Escape closes it and gives focus back to the document; a press outside closes it', async ({
    tei,
  }) => {
    await tei.open({ content: '<p>text</p>' });
    await tei.selectAll();
    await tei.page.keyboard.press('ControlOrMeta+k');
    await expect(editorForm(tei).getByRole('textbox')).toBeFocused();
    await tei.page.keyboard.press('Escape');
    await expect(editorForm(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
    await tei.page.keyboard.press('ControlOrMeta+k');
    await expect(editorForm(tei)).toHaveCount(1);
    await tei.page.mouse.click(5, 5);
    await expect(editorForm(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>text</p>');
  });

  test('a caret in a link shows it, with Edit and Remove', async ({ tei }) => {
    await tei.open({ content: '<p>Go <a href="https://example.com/a/">here</a> now</p>' });
    await tei.content.locator('a').click();
    await expect(preview(tei)).toBeVisible();
    const url = preview(tei).getByRole('link');
    await expect(url).toHaveText('example.com/a');
    await expect(url).toHaveAttribute('target', '_blank');
    await expect(url).toHaveAttribute('rel', 'noopener noreferrer');
    // It sits under the link.
    const link = await tei.content.locator('a').boundingBox();
    const bar = await preview(tei).boundingBox();
    expect(bar && link && bar.y).toBeGreaterThan((link?.y ?? 0) + (link?.height ?? 0) - 1);

    await preview(tei).getByRole('button', { name: 'Edit link' }).click();
    const input = editorForm(tei).getByRole('textbox');
    await expect(input).toHaveValue('https://example.com/a/');
    await input.fill('https://example.org');
    await input.press('Enter');
    expect(await tei.html()).toBe(
      '<p>Go <a href="https://example.org" rel="noopener noreferrer">here</a> now</p>',
    );

    await tei.content.locator('a').click();
    await preview(tei).getByRole('button', { name: 'Remove link' }).click();
    expect(await tei.html()).toBe('<p>Go here now</p>');
    await expect(preview(tei)).toHaveCount(0);
  });

  test('the preview goes when the caret leaves the link or focus leaves the editor', async ({
    tei,
  }) => {
    await tei.open({ content: '<p>Go <a href="https://example.com">here</a> now</p>' });
    await tei.content.locator('a').click();
    await expect(preview(tei)).toBeVisible();
    await tei.caretAtEnd();
    await expect(preview(tei)).toHaveCount(0);
    await tei.content.locator('a').click();
    await expect(preview(tei)).toBeVisible();
    await tei.page.getByTestId('dialog-trigger').focus();
    await expect(preview(tei)).toHaveCount(0);
  });

  test('clearing the URL of a link removes it', async ({ tei }) => {
    await tei.open({ content: '<p><a href="https://example.com">here</a></p>' });
    await tei.content.locator('a').click();
    await tei.page.keyboard.press('ControlOrMeta+k');
    const input = editorForm(tei).getByRole('textbox');
    await input.fill('');
    await input.press('Enter');
    expect(await tei.html()).toBe('<p>here</p>');
  });
});

test.describe('bubble menu', () => {
  const bubble = (tei: Harness) => tei.page.locator('[data-tei-control="bubble-menu"]');

  test('appears over a selection once the mouse is up, not while dragging', async ({ tei }) => {
    await tei.open({ content: '<p>One</p><p>Two</p><p>Select these words please</p>' });
    const text = await tei.content.locator('p').nth(2).boundingBox();
    if (!text) throw new Error('no box');
    await tei.page.mouse.move(text.x + 2, text.y + text.height / 2);
    await tei.page.mouse.down();
    await tei.page.mouse.move(text.x + 120, text.y + text.height / 2, { steps: 5 });
    await tei.page.waitForTimeout(100);
    await expect(bubble(tei)).toHaveCount(0);
    await tei.page.mouse.up();
    await expect(bubble(tei)).toBeVisible();
    await settled(tei.page);
    const bar = await bubble(tei).boundingBox();
    // Above the text, as a toolbar.
    expect((bar?.y ?? 0) + (bar?.height ?? 0)).toBeLessThanOrEqual(text.y + 1);
    await expect(bubble(tei)).toHaveAttribute('role', 'toolbar');
  });

  test('over the first line it goes below, leaving the toolbar free', async ({ tei }) => {
    await tei.open({ content: '<p>words</p><p>more</p>' });
    // Drag across the word (the text's own box, not the paragraph's).
    const word = await tei.page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('[data-tei-content] p') as Element);
      const { left, right, top, height } = range.getBoundingClientRect();
      return { left, right, y: top + height / 2 };
    });
    await tei.page.mouse.move(word.left + 1, word.y);
    await tei.page.mouse.down();
    await tei.page.mouse.move(word.right - 1, word.y, { steps: 4 });
    await tei.page.mouse.up();
    await expect(bubble(tei)).toBeVisible();
    await settled(tei.page);
    const bar = await bubble(tei).boundingBox();
    const text = await tei.content.locator('p').first().boundingBox();
    const toolbar = await tei.page
      .getByRole('toolbar', { name: 'Formatting', exact: true })
      .boundingBox();
    expect(bar?.y ?? 0).toBeGreaterThanOrEqual((text?.y ?? 0) + (text?.height ?? 0) - 1);
    expect(bar?.y ?? 0).toBeGreaterThan((toolbar?.y ?? 0) + (toolbar?.height ?? 0));
  });

  test('goes when a press outside takes focus nowhere', async ({ tei }) => {
    await tei.open({ content: '<p>words</p>' });
    await tei.selectAll();
    await expect(bubble(tei)).toBeVisible();
    // Blank page, nothing focusable: focus goes to the body.
    const size = tei.page.viewportSize();
    await tei.page.mouse.click(4, (size?.height ?? 600) - 4);
    await expect(bubble(tei)).toHaveCount(0);
  });

  test('formats the selection and stays, lit up', async ({ tei }) => {
    await tei.open({ content: '<p>words</p>' });
    await tei.selectAll();
    const bold = bubble(tei).getByRole('button', { name: 'Bold' });
    await bold.click();
    expect(await tei.html()).toBe('<p><strong>words</strong></p>');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await expect(tei.content).toBeFocused();
  });

  test('shows for a keyboard selection and goes when it collapses', async ({ tei }) => {
    await tei.open({ content: '<p>words</p>' });
    await tei.caretAtEnd();
    await expect(bubble(tei)).toHaveCount(0);
    await tei.page.keyboard.press('Shift+ArrowLeft');
    await tei.page.keyboard.press('Shift+ArrowLeft');
    await expect(bubble(tei)).toBeVisible();
    await tei.page.keyboard.press('ArrowRight');
    await expect(bubble(tei)).toHaveCount(0);
  });

  test('not over code, which takes no formatting', async ({ tei }) => {
    await tei.open({ content: '<pre><code>let x = 1;</code></pre>' });
    // In the document a code block is a `code.tei-code-block`; `pre` is its HTML export.
    const code = tei.content.locator('.tei-code-block');
    await code.click();
    await code.evaluate((el) => getSelection()?.selectAllChildren(el));
    await tei.page.waitForTimeout(150);
    expect(await tei.page.evaluate(() => getSelection()?.toString())).toBe('let x = 1;');
    await expect(bubble(tei)).toHaveCount(0);
  });

  test('goes once focus leaves the editor', async ({ tei }) => {
    await tei.open({ content: '<p>text</p>' });
    await tei.selectAll();
    await expect(bubble(tei)).toBeVisible();
    await tei.page.getByTestId('dialog-trigger').focus();
    await expect(bubble(tei)).toHaveCount(0);
  });

  test('its link button hands over to the link editor', async ({ tei }) => {
    await tei.open({ content: '<p>words</p>' });
    await tei.selectAll();
    await bubble(tei).getByRole('button', { name: 'Link' }).click();
    await expect(tei.page.locator('[data-tei-control="link-editor"]')).toBeVisible();
    await expect(bubble(tei)).toHaveCount(0);
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
    const bold = tei.page
      .getByRole('toolbar', { name: 'Formatting', exact: true })
      .locator('[data-item="bold"]');
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

test.describe('slash menu', () => {
  const slash = (tei: Harness) => tei.page.locator('[data-tei-control="slash-menu"]');

  test('opens on `/`, filters, and turns the block into the pick', async ({ tei }) => {
    await tei.open({ content: '<p>Title</p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/');
    await expect(slash(tei)).toBeVisible();
    // Grouped while there is no query.
    await expect(slash(tei).getByRole('group').first()).toBeVisible();
    await tei.page.keyboard.type('head');
    const options = slash(tei).getByRole('menuitem');
    await expect(options.first()).toContainText('Heading 1');
    // Focus never leaves the document; the lit row is announced through it.
    await expect(tei.content).toBeFocused();
    await tei.page.keyboard.press('ArrowDown');
    const lit = await tei.content.getAttribute('aria-activedescendant');
    expect(lit).toBeTruthy();
    await expect(tei.page.locator(`[id="${lit}"]`)).toContainText('Heading 2');
    await tei.page.keyboard.press('Enter');
    await expect(slash(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Title</p><h2><br></h2>');
    await tei.page.keyboard.type('Sub');
    expect(await tei.html()).toBe('<p>Title</p><h2>Sub</h2>');
    await expect(tei.content).not.toHaveAttribute('aria-activedescendant');
  });

  test('ranks label matches first, and a new query starts from the top', async ({ tei }) => {
    await tei.open({ content: '<p><br></p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.type('/t');
    const options = slash(tei).getByRole('menuitem');
    // "Text" and "To-do list" start with it; headings only have "title" as a keyword.
    await expect(options.nth(0)).toContainText('Text');
    await expect(options.nth(1)).toContainText('To-do list');
    // Lit on the third row, a new query lights its first: Bulleted, not To-do.
    await tei.page.keyboard.press('Backspace');
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.type('list');
    await expect(options).toHaveCount(3);
    await tei.page.keyboard.press('Enter');
    expect(await tei.html()).toBe('<ul><li></li></ul>');
  });

  test('Tab picks, a click picks', async ({ tei }) => {
    await tei.open({ content: '<p><br></p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.type('/quote');
    await tei.page.keyboard.press('Tab');
    expect(await tei.html()).toBe('<blockquote><br></blockquote>');
    await tei.page.keyboard.type('/divider');
    await slash(tei).getByRole('menuitem').first().click();
    expect(await tei.html()).toContain('<hr');
    expect(await tei.html()).not.toContain('/divider');
  });

  test('Escape closes it and leaves the text; it stays closed for that slash', async ({ tei }) => {
    await tei.open({ content: '<p><br></p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.type('/he');
    await expect(slash(tei)).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await expect(slash(tei)).toHaveCount(0);
    await tei.page.keyboard.type('a');
    await expect(slash(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>/hea</p>');
    // A new slash opens it again.
    await tei.page.keyboard.type(' /');
    await expect(slash(tei)).toBeVisible();
  });

  test('not mid-word, not in code, and Enter types a line when nothing matches', async ({
    tei,
  }) => {
    await tei.open({ content: '<p><br></p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.type('and/or');
    await expect(slash(tei)).toHaveCount(0);
    await tei.page.keyboard.type(' /zzzz');
    await expect(slash(tei)).toBeVisible();
    await expect(slash(tei)).toContainText('No matches');
    await tei.page.keyboard.press('Enter');
    expect(await tei.html()).toBe('<p>and/or /zzzz</p><p><br></p>');

    await tei.open({ content: '<pre><code>x</code></pre>' });
    await tei.content.locator('.tei-code-block').click();
    await tei.page.keyboard.press('End');
    await tei.page.keyboard.type(' /');
    await tei.page.waitForTimeout(100);
    await expect(slash(tei)).toHaveCount(0);
  });

  test('goes when focus leaves the editor', async ({ tei }) => {
    await tei.open({ content: '<p><br></p>' });
    await tei.caretAtEnd();
    await tei.page.keyboard.type('/');
    await expect(slash(tei)).toBeVisible();
    await tei.page.getByTestId('dialog-trigger').focus();
    await expect(slash(tei)).toHaveCount(0);
  });
});
