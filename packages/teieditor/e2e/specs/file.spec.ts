import { expect, type Harness, test } from './fixtures';

const PDF =
  '<a href="/report.pdf" download="report.pdf" data-tei-file="" data-ext="PDF" data-size="2516582" title="2.4 MB" type="application/pdf">report.pdf</a>';
const DOC = `<p>Before</p>${PDF}<p>After</p>`;

/** A 1×1 PNG: Chrome reports a CSP connect-src for an image it cannot decode. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const card = (tei: Harness) => tei.page.locator('[data-tei-file]');
const toolbar = (tei: Harness) => tei.page.locator('[data-tei-control="file-toolbar"]');
const button = (tei: Harness, name: string) =>
  toolbar(tei).getByRole('button', { name, exact: true });

async function selectFile(tei: Harness) {
  await card(tei).click();
  await expect(card(tei)).toHaveAttribute('data-tei-selected', '');
  await expect(toolbar(tei)).toBeVisible();
}

/** Drop files on the document's first paragraph, as the browser hands them over. */
async function drop(tei: Harness, files: Array<{ name: string; type: string }>) {
  await tei.page.evaluate(
    ({ files, png }) => {
      const data = new DataTransfer();
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      for (const { name, type } of files) data.items.add(new File([bytes], name, { type }));
      const target = document.querySelector('[data-tei-content] p') as HTMLElement;
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
          clientX: rect.right - 1,
          clientY: rect.top + rect.height / 2,
        }),
      );
    },
    { files, png: PNG },
  );
}

test.describe('files', () => {
  test('shows its kind, name and size; a click selects it and shows its toolbar', async ({
    tei,
  }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await expect(card(tei)).toHaveAttribute('data-ext', 'PDF');
    await expect(card(tei).locator('.tei-file-name')).toHaveText('report.pdf');
    await expect(card(tei).locator('.tei-file-meta')).toHaveText('2.4 MB');
    await selectFile(tei);
    await expect(toolbar(tei).getByRole('button')).toHaveCount(4);
    await tei.content.getByText('After').click();
    await expect(toolbar(tei)).toHaveCount(0);
    await expect(card(tei)).not.toHaveAttribute('data-tei-selected');
  });

  test('a click while editing selects it, never follows the link', async ({ tei, page }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    const url = page.url();
    const download = page.waitForEvent('download', { timeout: 500 }).catch(() => null);
    // On its name, where the link is in a read-only document.
    const name = await card(tei).locator('.tei-file-name').boundingBox();
    if (!name) throw new Error('no name');
    await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2);
    await expect(card(tei)).toHaveAttribute('data-tei-selected', '');
    expect(await download).toBeNull();
    // No pointer on the link while editing: no URL on hover, no long-press link menu.
    const link = card(tei).locator('a');
    await expect(link).toHaveCSS('pointer-events', 'none');
    await page.evaluate(() => window.__tei.editor.setEditable(false));
    await expect(link).toHaveCSS('pointer-events', 'auto');
    expect(page.url()).toBe(url);
  });

  test('attach from the file chooser: kept as a data URL without an upload handler', async ({
    tei,
    page,
  }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['file', 'plain'] });
    await tei.caretAtEnd();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-item="insertFile"]').click();
    await (await chooser).setFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
      { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b') },
    ]);
    await expect(card(tei)).toHaveCount(2);
    await expect(card(tei).first().locator('a')).toHaveAttribute('href', /^data:text\/plain/);
    await expect(card(tei).first().locator('.tei-file-meta')).toHaveText('5 B');
    await expect(card(tei).nth(1)).toHaveAttribute('data-ext', 'CSV');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(card(tei)).toHaveCount(0);
  });

  test('upload through a handler: progress on the card, then its URL', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['file', 'plain'] });
    await page.evaluate(() => {
      const w = window as unknown as {
        finish: (src: string) => void;
        progress: (n: number) => void;
      };
      window.__tei.setFileOptions({
        upload: (_file, { onProgress }) =>
          new Promise((resolve) => {
            w.progress = onProgress;
            w.finish = resolve;
          }),
      });
    });
    await tei.caretAtEnd();
    await drop(tei, [{ name: 'deck.pdf', type: 'application/pdf' }]);
    await expect(card(tei)).toHaveAttribute('data-tei-uploading', '');
    await expect(card(tei).locator('a')).not.toHaveAttribute('href');
    await page.evaluate(() =>
      (window as unknown as { progress: (n: number) => void }).progress(0.25),
    );
    await expect
      .poll(() =>
        card(tei).evaluate((el) => (el as HTMLElement).style.getPropertyValue('--tei-progress')),
      )
      .toBe('0.25');
    await page.evaluate(() =>
      (window as unknown as { finish: (src: string) => void }).finish('/deck.pdf'),
    );
    await expect(card(tei)).not.toHaveAttribute('data-tei-uploading');
    await expect(card(tei).locator('a')).toHaveAttribute('href', '/deck.pdf');
  });

  test('a failed upload takes the file out and reports it', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['file', 'plain'] });
    await page.evaluate(() =>
      window.__tei.setFileOptions({
        upload: () => Promise.reject(new Error('offline')),
        onUploadError: (error) => window.__tei.log.push(error.code),
      }),
    );
    await tei.caretAtEnd();
    await drop(tei, [{ name: 'deck.pdf', type: 'application/pdf' }]);
    await expect.poll(() => tei.log()).toEqual(['upload']);
    await expect(card(tei)).toHaveCount(0);
  });

  test('dropped with images: the images become images, the rest files', async ({ tei }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['file', 'image', 'plain'] });
    await tei.caretAtEnd();
    await drop(tei, [
      { name: 'photo.png', type: 'image/png' },
      { name: 'notes.pdf', type: 'application/pdf' },
    ]);
    await expect(card(tei)).toHaveCount(1);
    await expect(tei.page.locator('[data-tei-image]')).toHaveCount(1);
    await expect(card(tei)).toHaveAttribute('data-ext', 'PDF');
  });

  test('rename from its toolbar', async ({ tei, page }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await selectFile(tei);
    await button(tei, 'Rename').click();
    const input = page.locator('[data-tei-control="file-rename-input"]');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('report.pdf');
    await input.fill('Q3 report.pdf');
    await input.press('Enter');
    await expect(input).toHaveCount(0);
    await expect(card(tei).locator('.tei-file-name')).toHaveText('Q3 report.pdf');
    expect(await tei.html()).toContain('download="Q3 report.pdf"');
  });

  test('download from its toolbar', async ({ tei, page }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await selectFile(tei);
    const download = page.waitForEvent('download');
    await button(tei, 'Download').click();
    expect((await download).suggestedFilename()).toBe('report.pdf');
  });

  test('replace from its toolbar', async ({ tei, page }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await selectFile(tei);
    const chooser = page.waitForEvent('filechooser');
    await button(tei, 'Replace').click();
    await (await chooser).setFiles({
      name: 'new.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('zip'),
    });
    await expect(card(tei)).toHaveAttribute('data-ext', 'ZIP');
    await expect(card(tei).locator('a')).toHaveAttribute('href', /^data:application\/zip/);
    await expect(card(tei)).toHaveCount(1);
  });

  test('delete from its toolbar, or with Backspace', async ({ tei, page }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await selectFile(tei);
    await button(tei, 'Delete file').click();
    await expect(card(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Before</p><p>After</p>');
    await page.keyboard.press('ControlOrMeta+z');
    await selectFile(tei);
    await page.keyboard.press('Backspace');
    await expect(card(tei)).toHaveCount(0);
  });

  test('arrow keys step over it as one block, and typing starts a line after it', async ({
    tei,
    page,
  }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await tei.content.getByText('Before').click();
    await page.keyboard.press('End');
    // The editor takes the caret on the selectionchange that follows.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.keyboard.press('ArrowDown');
    await expect(card(tei)).toHaveAttribute('data-tei-selected', '');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await expect(card(tei)).toHaveAttribute('data-tei-selected', '');
    await page.keyboard.type('x');
    expect(await tei.html()).toBe(`<p>Before</p>${PDF}<p>x</p><p>After</p>`);
  });

  test('read-only: the card is a link that downloads, and no toolbar', async ({ tei, page }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await page.evaluate(() => window.__tei.editor.setEditable(false));
    const download = page.waitForEvent('download');
    await card(tei).click();
    expect((await download).suggestedFilename()).toBe('report.pdf');
    await expect(toolbar(tei)).toHaveCount(0);
  });

  test('File in the slash menu opens the chooser', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['file', 'plain'] });
    await tei.caretAtEnd();
    await page.keyboard.press('Enter');
    await page.keyboard.type('/file');
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await chooser).setFiles({
      name: 'a.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('a'),
    });
    await expect(card(tei)).toHaveCount(1);
    expect(await tei.html()).toMatch(
      /^<p>Hello<\/p><a href="data:text\/plain[^"]*" download="a.txt"/,
    );
  });

  test('tap selects it on a phone, and its toolbar fits @mobile', async ({ tei, page }) => {
    await tei.open({ content: DOC, flags: ['file', 'plain'] });
    await card(tei).tap();
    await expect(card(tei)).toHaveAttribute('data-tei-selected', '');
    const bar = await toolbar(tei).boundingBox();
    const viewport = page.viewportSize();
    expect(bar && viewport && bar.x >= 0 && bar.x + bar.width <= viewport.width).toBe(true);
  });
});
