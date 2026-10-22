import { expect, type Harness, test } from './fixtures';

const ghost = (tei: Harness) => tei.page.locator('[data-tei-autocomplete]');
const rubyEditor = (tei: Harness) => tei.page.locator('[data-tei-control="ruby-editor"]');

async function open(tei: Harness, content: string) {
  await tei.page.setViewportSize({ width: 900, height: 700 });
  await tei.open({ content, flags: ['inline-extras', 'plain'] });
}

/** Two frames: the editor takes up a DOM selection on the selectionchange after it. */
const frames = (tei: Harness) =>
  tei.page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

/** Put the caret at the end of the paragraph whose text is `text`. */
async function caretAtEndOf(tei: Harness, text: string) {
  await tei.content.evaluate((root, wanted) => {
    const block = [...root.querySelectorAll('p')].find((b) => b.textContent === wanted);
    if (!block) throw new Error(`no block ${wanted}`);
    (root as HTMLElement).focus();
    getSelection()?.selectAllChildren(block);
    getSelection()?.collapseToEnd();
  }, text);
  await frames(tei);
}

test.describe('typography as you type', () => {
  test('quotes, dashes and symbols; ⌘Z and Backspace give the typed text back', async ({ tei }) => {
    await open(tei, '<p>Start</p>');
    await caretAtEndOf(tei, 'Start');
    await tei.page.keyboard.type(' "Hi" -- it\'s (c) 1/2 ok...');
    expect(await tei.text()).toBe('Start “Hi” — it’s © ½ ok…');
    // Backspace straight after a replacement takes it back.
    await tei.page.keyboard.press('Backspace');
    expect(await tei.text()).toBe('Start “Hi” — it’s © ½ ok...');
    await tei.page.keyboard.type(' a->');
    expect(await tei.text()).toMatch(/ a→$/);
    await tei.page.keyboard.press('ControlOrMeta+z');
    expect(await tei.text()).toMatch(/ a->$/);
  });

  test('[bracketed] text becomes special text once the next character is typed', async ({
    tei,
  }) => {
    await open(tei, '<p>See</p>');
    await caretAtEndOf(tei, 'See');
    await tei.page.keyboard.type(' [note] here');
    await expect(tei.content.locator('.tei-special-text')).toHaveText('note');
    expect(await tei.html()).toBe('<p>See <span data-tei-special-text="">note</span> here</p>');
  });

  test('nothing is replaced in inline code', async ({ tei }) => {
    await open(tei, '<p>a <code>xy</code></p>');
    await tei.content.evaluate((root) => {
      const code = root.querySelector('code');
      const text = code && document.createTreeWalker(code, NodeFilter.SHOW_TEXT).nextNode();
      if (!text) throw new Error('no code text');
      (root as HTMLElement).focus();
      getSelection()?.collapse(text, 1);
    });
    await frames(tei);
    await tei.page.keyboard.type('--(c)');
    expect(await tei.text()).toBe('a x--(c)y');
  });
});

test.describe('autocomplete', () => {
  test('a ghost after the caret, in the line; Tab takes it, Escape drops it', async ({ tei }) => {
    await open(tei, '<p>Start</p>');
    await caretAtEndOf(tei, 'Start');
    await tei.page.keyboard.type(' beca');
    await expect(ghost(tei)).toHaveText('use');
    await expect(ghost(tei)).toHaveAttribute('aria-hidden', 'true');
    // Right after the caret, on its line.
    const caret = await tei.page.evaluate(() => {
      const rect = getSelection()?.getRangeAt(0).getClientRects()[0];
      return rect ? { x: rect.right, y: rect.top, height: rect.height } : null;
    });
    const box = await ghost(tei).boundingBox();
    expect(caret && box).toBeTruthy();
    if (caret && box) {
      expect(Math.abs(box.x - caret.x)).toBeLessThan(3);
      expect(Math.abs(box.y - caret.y)).toBeLessThan(3);
    }
    // Not in the document.
    expect(await tei.text()).toBe('Start beca');
    await tei.page.keyboard.press('Tab');
    await expect(ghost(tei)).toHaveCount(0);
    expect(await tei.text()).toBe('Start because');
    await expect(tei.page.locator('[data-tei-live]')).toHaveText('Completed: because');
    await expect(tei.content).toBeFocused();

    await tei.page.keyboard.type(' tomo');
    await expect(ghost(tei)).toHaveText('rrow');
    await tei.page.keyboard.press('Escape');
    await expect(ghost(tei)).toHaveCount(0);
    expect(await tei.text()).toBe('Start because tomo');
  });

  test('typing what it shows keeps it; → at the end takes it', async ({ tei }) => {
    await open(tei, '<p>Start</p>');
    await caretAtEndOf(tei, 'Start');
    await tei.page.keyboard.type(' wed');
    await expect(ghost(tei)).toHaveText('nesday');
    await tei.page.keyboard.type('nes');
    await expect(ghost(tei)).toHaveText('day');
    await tei.page.keyboard.press('ArrowRight');
    await expect(ghost(tei)).toHaveCount(0);
    expect(await tei.text()).toBe('Start wednesday');
  });
});

test.describe('keywords', () => {
  test('marked with a CSS highlight, not in the document', async ({ tei }) => {
    await open(tei, '<p>I like teieditor a lot</p>');
    const marks = await tei.page.evaluate(() => {
      const registry = (globalThis as { CSS?: { highlights?: Map<string, Set<StaticRange>> } }).CSS
        ?.highlights;
      if (!registry) return null;
      return [...(registry.get('tei-keyword') ?? [])].map((range) =>
        (range.startContainer as Text).data.slice(range.startOffset, range.endOffset),
      );
    });
    test.skip(marks === null, 'no CSS Custom Highlight API in this browser');
    expect(marks).toEqual(['teieditor']);
    expect(await tei.html()).toBe('<p>I like teieditor a lot</p>');
  });
});

test.describe('ruby', () => {
  test('annotate the selection; the reading shows above; a click on it edits it', async ({
    tei,
  }) => {
    await open(tei, '<p>漢字です</p>');
    await tei.content.evaluate((root) => {
      const text = root.querySelector('p')?.firstChild?.firstChild ?? null;
      (root as HTMLElement).focus();
      if (text) getSelection()?.setBaseAndExtent(text, 0, text, 2);
    });
    await frames(tei);
    expect(await tei.page.evaluate(() => window.__tei.editor.commands.openRubyEditor())).toBe(true);
    await expect(rubyEditor(tei)).toBeVisible();
    await tei.page.keyboard.type('かんじ');
    await tei.page.keyboard.press('Enter');
    await expect(rubyEditor(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p><ruby>漢字<rt>かんじ</rt></ruby>です</p>');
    // The reading sits above its base text.
    const rt = tei.content.locator('rt');
    const [base, reading] = await tei.content.evaluate((root) => {
      const ruby = root.querySelector('ruby');
      const text = ruby && document.createTreeWalker(ruby, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      if (text) range.selectNodeContents(text);
      const annotation = ruby?.querySelector('rt')?.getBoundingClientRect();
      const box = range.getBoundingClientRect();
      return [
        { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
        {
          bottom: annotation?.bottom ?? Number.NaN,
          center: annotation ? (annotation.left + annotation.right) / 2 : Number.NaN,
        },
      ] as const;
    });
    // Above the base glyphs (Firefox's line boxes overlap by a pixel or two).
    expect(reading.bottom).toBeLessThan((base.top + base.bottom) / 2);
    expect(reading.center).toBeGreaterThan(base.left);
    expect(reading.center).toBeLessThan(base.right);

    await rt.click();
    await expect(rubyEditor(tei)).toBeVisible();
    await expect(rubyEditor(tei).getByRole('textbox')).toHaveValue('かんじ');
    await rubyEditor(tei).getByRole('button', { name: 'Remove annotation' }).click();
    expect(await tei.html()).toBe('<p>漢字です</p>');
  });
});
