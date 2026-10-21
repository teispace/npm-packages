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

  test('line numbers stay put while a long line scrolls sideways', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 500, height: 800 });
    await tei.open({ content: `<pre><code>short\n${'a long line '.repeat(30)}\nend</code></pre>` });
    const code = tei.content.locator('.tei-code-block');
    /** What is drawn just inside the start edge, on line 2: the gutter is the block itself. */
    const atEdge = () =>
      code.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const line = box.top + box.height / 2;
        const hit = document.elementFromPoint(box.left + 12, line);
        const gutter = getComputedStyle(el, '::before');
        return {
          gutter: hit === el,
          width: gutter.width,
          height: Number.parseFloat(gutter.height),
        };
      });
    const before = await atEdge();
    expect(before.gutter).toBe(true);
    await code.evaluate((el) => {
      el.scrollLeft = 300;
    });
    expect(await code.evaluate((el) => el.scrollLeft)).toBe(300);
    expect(await atEdge()).toEqual(before);
    // As tall as the block inside its border: every line has its number.
    const inner = await code.evaluate((el) => el.clientHeight);
    expect(Math.abs(before.height - inner)).toBeLessThan(1);
  });

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

test.describe('code block bar', () => {
  const CODE = '<p>Intro</p><pre><code>def answer():\n    return 42</code></pre><p>After</p>';

  test('shows in the corner of the block under the pointer, and goes when it leaves', async ({
    tei,
  }) => {
    await tei.open({ content: CODE });
    const code = tei.content.locator('.tei-code-block');
    const bar = tei.page.getByRole('toolbar', { name: 'Code block' });
    await expect(bar).toBeHidden();
    await code.hover();
    await expect(bar).toBeVisible();
    const [b, c] = [await bar.boundingBox(), await code.boundingBox()];
    if (!b || !c) throw new Error('no boxes');
    // Inside the block, against its top end corner.
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width);
    expect(b.x + b.width).toBeGreaterThan(c.x + c.width - 12);
    expect(b.y).toBeGreaterThanOrEqual(c.y);
    expect(b.y).toBeLessThan(c.y + 12);
    await tei.content.getByText('After').hover();
    await expect(bar).toBeHidden();
    await code.hover();
    await expect(bar).toBeVisible();
    await tei.page.mouse.move(2, 2);
    await expect(bar).toBeHidden();
  });

  test('the pointer can reach it, and its menu changes the language', async ({ tei }) => {
    await tei.open({ content: CODE });
    const code = tei.content.locator('.tei-code-block');
    await code.hover();
    const language = tei.page.getByRole('button', { name: 'Language: Plain text' });
    await language.hover();
    await language.click();
    const menu = tei.page.getByRole('menu', { name: 'Language' });
    await menu.getByRole('menuitemradio', { name: 'Python' }).click();
    await expect(menu).toBeHidden();
    await expect(tei.page.getByRole('button', { name: 'Language: Python' })).toBeVisible();
    await expect(code.locator('.tei-token-keyword').first()).toHaveText('def');
    expect(await tei.html()).toContain('data-language="py"');
  });

  test('the caret shows it too, for keyboard and touch', async ({ tei }) => {
    await tei.open({ content: CODE });
    const bar = tei.page.getByRole('toolbar', { name: 'Code block' });
    await tei.content.getByText('Intro').click();
    await tei.page.mouse.move(2, 2);
    await expect(bar).toBeHidden();
    await tei.page.keyboard.press('ArrowDown');
    await expect(bar).toBeVisible();
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.press('ArrowDown');
    await expect(bar).toBeHidden();
    // Escape stays the editor's (which lets focus go): the bar takes no key.
    await tei.page.keyboard.press('ArrowUp');
    await expect(bar).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await expect(tei.content).not.toBeFocused();
    await expect(bar).toBeHidden();
  });

  test('copies the code, and says so', async ({ tei, browserName, context }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await tei.open({ content: CODE });
    await tei.content.locator('.tei-code-block').hover();
    const copy = tei.page.getByRole('button', { name: 'Copy code' });
    await copy.hover();
    await copy.click();
    await expect(tei.page.getByRole('button', { name: 'Copied' })).toBeVisible();
    await expect(tei.page.getByRole('status').filter({ hasText: 'Copied' })).toHaveCount(1);
    if (browserName === 'chromium') {
      expect(await tei.page.evaluate(() => navigator.clipboard.readText())).toBe(
        'def answer():\n    return 42',
      );
    }
    await expect(tei.page.getByRole('button', { name: 'Copy code' })).toBeVisible();
  });

  test('stays in view while a tall block scrolls', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 800, height: 400 });
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    await tei.open({ content: `<p>Intro</p><pre><code>${lines}</code></pre>`, flags: ['tall'] });
    const code = tei.content.locator('.tei-code-block');
    await code.hover({ position: { x: 100, y: 20 } });
    const bar = tei.page.getByRole('toolbar', { name: 'Code block' });
    await expect(bar).toBeVisible();
    await tei.page.mouse.wheel(0, 600);
    await expect.poll(async () => (await bar.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    const box = await bar.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(400);
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

test.describe('text style', () => {
  const formatting = (tei: Harness) =>
    tei.page.getByRole('toolbar', { name: 'Formatting', exact: true });
  /** Select "world" with a real drag, as a user would. */
  async function selectWorld(tei: Harness) {
    const box = await tei.content.evaluate((el) => {
      const text =
        el.querySelector('p')?.firstChild?.firstChild ?? el.querySelector('p')?.firstChild;
      const range = document.createRange();
      const node = text as Text;
      const start = (node.textContent ?? '').indexOf('world');
      range.setStart(node, start);
      range.setEnd(node, start + 5);
      return range.getBoundingClientRect().toJSON();
    });
    await tei.page.mouse.move(box.left + 1, box.top + box.height / 2);
    await tei.page.mouse.down();
    await tei.page.mouse.move(box.right - 1, box.top + box.height / 2, { steps: 5 });
    await tei.page.mouse.up();
  }

  test('a font from the menu, shown in its own face, names the selection', async ({ tei }) => {
    await tei.open({ content: '<p>Hello world</p>' });
    await selectWorld(tei);
    const trigger = formatting(tei).locator('[data-tei-control="fontFamily"]');
    await expect(trigger).toHaveAccessibleName('Font: Default font');
    await trigger.click();
    const menu = tei.page.getByRole('menu', { name: 'Font' });
    const georgia = menu.getByRole('menuitemradio', { name: 'Georgia' });
    // The row shows the face itself (set through the CSSOM).
    expect(
      await georgia.evaluate((el) =>
        [...el.querySelectorAll('span')].some((s) => s.style.fontFamily.includes('Georgia')),
      ),
    ).toBe(true);
    await georgia.click();
    expect(await tei.html()).toBe(
      '<p>Hello <span style="font-family: Georgia, serif;">world</span></p>',
    );
    await expect(trigger).toHaveAccessibleName('Font: Georgia');
    expect(await tei.problems()).toEqual([]);
  });

  test('the size steps along the scale, and takes a typed size', async ({ tei }) => {
    await tei.open({ content: '<p>Hello world</p>' });
    await selectWorld(tei);
    const field = formatting(tei).getByRole('spinbutton', { name: 'Font size' });
    await expect(field).toHaveValue('16');
    await formatting(tei).getByRole('button', { name: 'Bigger text' }).click();
    await expect(field).toHaveValue('18');
    expect(await tei.html()).toBe('<p>Hello <span style="font-size: 18px;">world</span></p>');
    await field.fill('30');
    await field.press('Enter');
    expect(await tei.html()).toBe('<p>Hello <span style="font-size: 30px;">world</span></p>');
    await expect(field).toHaveValue('30');
    // Enter hands the keyboard back to the document, selection intact.
    await expect(tei.content).toBeFocused();
    await tei.page.keyboard.press('ControlOrMeta+Shift+Comma');
    await expect(field).toHaveValue('24');
  });

  test('colours from the bubble: a swatch, then back to the default', async ({ tei }) => {
    await tei.open({ content: '<p>Hello world</p>' });
    await selectWorld(tei);
    const bubble = tei.page.locator('[data-tei-control="bubble-menu"]');
    await bubble.getByRole('button', { name: 'Text colour' }).click();
    await tei.page.getByRole('button', { name: 'Red', exact: true }).click();
    expect(await tei.html()).toBe(
      '<p>Hello <span style="color: rgb(220, 38, 38);">world</span></p>',
    );
    // The bar under the icon shows it.
    await bubble.getByRole('button', { name: 'Text colour' }).click();
    await expect(tei.page.getByRole('button', { name: 'Red', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await tei.page.getByRole('button', { name: 'Default', exact: true }).click();
    expect(await tei.html()).toBe('<p>Hello world</p>');
    expect(await tei.problems()).toEqual([]);
  });

  test('on a phone, sizes and colours are in More as submenus', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 375, height: 800 });
    await tei.open({ content: '<p>Hello world</p>' });
    await selectWorld(tei);
    await formatting(tei).locator('[data-tei-control="more"]').click();
    const more = tei.page.getByRole('menu', { name: 'More' });
    await more.getByRole('menuitem', { name: /Highlight colour/ }).click();
    await tei.page
      .getByRole('menu', { name: 'Highlight colour' })
      .getByRole('menuitemradio', { name: 'Yellow' })
      .click();
    expect(await tei.html()).toBe(
      '<p>Hello <span style="background-color: rgba(234, 179, 8, 0.35);">world</span></p>',
    );
  });
});

test.describe('tables', () => {
  const TABLE =
    '<p>Intro</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><p>After</p>';
  /** The table's text, row by row. */
  const cells = (tei: Harness) =>
    tei.content
      .locator('table')
      .first()
      .evaluate((table) =>
        [...(table as HTMLTableElement).rows].map((row) =>
          [...row.cells].map((cell) => cell.textContent ?? ''),
        ),
      );

  test('the toolbar grid inserts the size picked, the caret in its first cell', async ({ tei }) => {
    // `plain`: no text styles, so the table button fits in the toolbar.
    await tei.open({ content: '<p>Hello</p>', flags: ['table', 'plain'] });
    await tei.caretAtEnd();
    await tei.page.locator('[data-tei-control="insertTable"]').first().click();
    const grid = tei.page.getByRole('group').filter({ has: tei.page.getByLabel('3 × 4') });
    await grid.getByLabel('3 × 4').hover();
    await expect(tei.page.locator('.tei-grid-caption')).toHaveText('3 × 4');
    await grid.getByLabel('3 × 4').click();
    await expect(tei.content.locator('table tr')).toHaveCount(3);
    await expect(tei.content.locator('table tr').first().locator('th, td')).toHaveCount(4);
    await tei.page.keyboard.type('Name');
    await tei.page.keyboard.press('Tab');
    await tei.page.keyboard.type('Age');
    expect((await cells(tei))[0]?.slice(0, 2)).toEqual(['Name', 'Age']);
    expect(await tei.problems()).toEqual([]);
  });

  test('when it does not fit, More offers a few sizes', async ({ tei }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['table'] });
    await tei.caretAtEnd();
    await tei.page.locator('[data-tei-control="more"]').first().click();
    const more = tei.page.getByRole('menu', { name: 'More' });
    await more.getByRole('menuitem', { name: 'Table' }).click();
    await tei.page.getByRole('menuitem', { name: '4 × 4' }).click();
    await expect(tei.content.locator('table tr')).toHaveCount(4);
    await expect(tei.content.locator('table tr').first().locator('th, td')).toHaveCount(4);
    expect(await tei.problems()).toEqual([]);
  });

  test('`/table` inserts one too', async ({ tei }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['table'] });
    await tei.caretAtEnd();
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/table');
    await tei.page.keyboard.press('Enter');
    await expect(tei.content.locator('table tr')).toHaveCount(3);
    expect(await tei.problems()).toEqual([]);
  });

  test('the cell menu adds and deletes rows and columns, and toggles the header', async ({
    tei,
  }) => {
    await tei.open({ content: TABLE, flags: ['table'] });
    await tei.content.getByText('1', { exact: true }).click();
    const handle = tei.page.getByRole('button', { name: 'Cell options' });
    await expect(handle).toBeVisible();
    // It sits inside the cell, against its top end corner.
    const [h, c] = [
      await handle.boundingBox(),
      await tei.content.getByText('1', { exact: true }).locator('xpath=ancestor::td').boundingBox(),
    ];
    if (!h || !c) throw new Error('no boxes');
    expect(h.x + h.width).toBeLessThanOrEqual(c.x + c.width);
    expect(h.y).toBeGreaterThanOrEqual(c.y);
    await handle.click();
    const menu = tei.page.getByRole('menu', { name: 'Table' });
    await menu.getByRole('menuitem', { name: 'Insert row below' }).click();
    expect(await cells(tei)).toEqual([
      ['A', 'B'],
      ['1', '2'],
      ['', ''],
    ]);
    await handle.click();
    await menu.getByRole('menuitem', { name: 'Insert column left' }).click();
    expect(await cells(tei)).toEqual([
      ['', 'A', 'B'],
      ['', '1', '2'],
      ['', '', ''],
    ]);
    // The caret stayed in "1": its column goes.
    await handle.click();
    await menu.getByRole('menuitem', { name: 'Delete column' }).click();
    expect(await cells(tei)).toEqual([
      ['', 'B'],
      ['', '2'],
      ['', ''],
    ]);
    await handle.click();
    await menu.getByRole('menuitemcheckbox', { name: 'Header row' }).click();
    await expect(tei.content.locator('th')).toHaveCount(0);
    expect(await tei.problems()).toEqual([]);
  });

  test('without the context menu, right-click in a cell opens the cell menu there', async ({
    tei,
  }) => {
    await tei.open({ content: TABLE, flags: ['table', 'nocontext'] });
    const cell = tei.content.getByText('2', { exact: true });
    await cell.click({ button: 'right' });
    const menu = tei.page.getByRole('menu', { name: 'Table' });
    await expect(menu).toBeVisible();
    const [m, c] = [await menu.boundingBox(), await cell.boundingBox()];
    if (!m || !c) throw new Error('no boxes');
    expect(Math.abs(m.y - (c.y + c.height / 2))).toBeLessThan(24);
    await tei.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await tei.problems()).toEqual([]);
  });

  test('a cell colour and vertical alignment from their submenus', async ({ tei }) => {
    await tei.open({ content: TABLE, flags: ['table'] });
    await tei.content.getByText('1', { exact: true }).click();
    const handle = tei.page.getByRole('button', { name: 'Cell options' });
    await handle.click();
    const menu = tei.page.getByRole('menu', { name: 'Table' });
    await menu.getByRole('menuitem', { name: 'Cell colour' }).click();
    await tei.page.getByRole('menuitemradio', { name: 'Blue' }).click();
    expect(await tei.html()).toMatch(/<td style="background-color: rgb[^"]*">\s*<p>1<\/p>/);
    await handle.click();
    await menu.getByRole('menuitem', { name: 'Vertical align' }).click();
    await tei.page.getByRole('menuitemradio', { name: 'Middle' }).click();
    expect(await tei.html()).toContain('vertical-align: middle');
    expect(await tei.problems()).toEqual([]);
  });

  test('the + bars add a row and a column at the end', async ({ tei }) => {
    await tei.open({ content: TABLE, flags: ['table'] });
    await tei.content.locator('table').hover();
    const row = tei.page.getByRole('button', { name: 'Add a row' });
    const column = tei.page.getByRole('button', { name: 'Add a column' });
    await expect(row).toBeVisible();
    await settled(tei.page);
    const [r, t] = [await row.boundingBox(), await tei.content.locator('table').boundingBox()];
    if (!r || !t) throw new Error('no boxes');
    // Under the table, as wide as it.
    expect(r.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
    expect(Math.abs(r.width - t.width)).toBeLessThanOrEqual(2);
    await row.click();
    expect(await cells(tei)).toEqual([
      ['A', 'B'],
      ['1', '2'],
      ['', ''],
    ]);
    await tei.content.locator('table').hover();
    await column.click();
    expect(await cells(tei)).toEqual([
      ['A', 'B', ''],
      ['1', '2', ''],
      ['', '', ''],
    ]);
    expect(await tei.problems()).toEqual([]);
  });

  test('dragging a column edge resizes it, saved as the column width', async ({ tei }) => {
    await tei.open({ content: TABLE, flags: ['table'] });
    const first = tei.content.locator('th').first();
    const box = await first.boundingBox();
    if (!box) throw new Error('no box');
    const edge = box.x + box.width;
    // Below the cell's menu handle, which sits in its top corner.
    const y = box.y + box.height * 0.8;
    await tei.page.mouse.move(edge - 10, y);
    await tei.page.mouse.move(edge - 1, y, { steps: 3 });
    const handle = tei.page.getByRole('separator', { name: 'Resize column' });
    await expect(handle).toBeVisible();
    const h = await handle.boundingBox();
    if (!h) throw new Error('no handle');
    expect(Math.abs(h.x + h.width / 2 - edge)).toBeLessThanOrEqual(2);
    await tei.page.mouse.move(h.x + h.width / 2, y);
    await tei.page.mouse.down();
    await tei.page.mouse.move(h.x + h.width / 2 + 80, y, { steps: 6 });
    await tei.page.mouse.up();
    const after = await first.boundingBox();
    expect(Math.abs((after?.width ?? 0) - (box.width + 80))).toBeLessThanOrEqual(2);
    expect(await tei.html()).toMatch(/<col style="width: \d+px;?">/);
    expect(await tei.problems()).toEqual([]);
  });

  test('the controls stay over the resize handle, and go once the pointer leaves', async ({
    tei,
  }) => {
    await tei.open({ content: TABLE, flags: ['table'] });
    const box = await tei.content.locator('th').first().boundingBox();
    if (!box) throw new Error('no box');
    // Onto the column edge: the resize handle shows right under the pointer.
    await tei.page.mouse.move(box.x + box.width - 8, box.y + box.height * 0.8);
    await tei.page.mouse.move(box.x + box.width, box.y + box.height * 0.8, { steps: 3 });
    await expect(tei.page.getByRole('separator', { name: 'Resize column' })).toBeVisible();
    const row = tei.page.getByRole('button', { name: 'Add a row' });
    await tei.page.waitForTimeout(400);
    await expect(row).toBeVisible();
    // Straight off the handle and out of the table.
    await tei.page.mouse.move(box.x + box.width, 2);
    await expect(row).toBeHidden();
    await expect(tei.page.getByRole('separator', { name: 'Resize column' })).toBeHidden();
    expect(await tei.problems()).toEqual([]);
  });

  test('Tab walks the cells and adds a row past the last one', async ({ tei }) => {
    await tei.open({ content: TABLE, flags: ['table'] });
    await tei.content.getByText('2', { exact: true }).click();
    await tei.page.keyboard.press('End');
    await tei.page.keyboard.press('Tab');
    await tei.page.keyboard.type('x');
    expect(await cells(tei)).toEqual([
      ['A', 'B'],
      ['1', '2'],
      ['x', ''],
    ]);
    await tei.page.keyboard.press('Shift+Tab');
    await tei.page.keyboard.type('y');
    expect((await cells(tei))[1]).toEqual(['1', '2y']);
    expect(await tei.problems()).toEqual([]);
  });

  test('a wide table scrolls inside its box and fades the edge with more', async ({ tei }) => {
    const wide = `<table><tr>${'<td>wide cell content</td>'.repeat(14)}</tr></table>`;
    await tei.open({ content: wide, flags: ['table'] });
    const box = tei.content.locator('.tei-table-scroll');
    await expect(box).toHaveAttribute('data-tei-overflow', 'right');
    await box.evaluate((el) => {
      el.scrollLeft = 120;
    });
    await expect(box).toHaveAttribute('data-tei-overflow', 'left right');
    await box.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(box).toHaveAttribute('data-tei-overflow', 'left');
    // The page itself never scrolls sideways.
    expect(await tei.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await tei.problems()).toEqual([]);
  });
});
