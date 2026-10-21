import { expect, type Harness, settled, test } from './fixtures';

/** A 1×1 PNG, as a file to upload, drop or paste. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const PHOTO = '<img src="/photo.svg" alt="Hills" width="300" height="180">';
const FIGURE = `<p>Before</p><figure>${PHOTO}<figcaption>A caption</figcaption></figure><p>After</p>`;

const figure = (tei: Harness) => tei.page.locator('[data-tei-image]');
const toolbar = (tei: Harness) => tei.page.locator('[data-tei-control="image-toolbar"]');
const button = (tei: Harness, name: string) =>
  toolbar(tei).getByRole('button', { name, exact: true });
const json = (tei: Harness) =>
  tei.page.evaluate(() => {
    const root = window.__tei.editor.getJSON() as { root: { children: Array<{ type: string }> } };
    return root.root.children.filter((node) => node.type === 'image') as Array<
      Record<string, unknown>
    >;
  });

async function selectImage(tei: Harness, index = 0) {
  await figure(tei).nth(index).locator('img').click();
  await expect(figure(tei).nth(index)).toHaveAttribute('data-tei-selected', '');
  await expect(toolbar(tei)).toBeVisible();
}

/** Drop or paste files on the document, as the browser hands them over. */
async function transfer(tei: Harness, kind: 'drop' | 'paste', files: number) {
  await tei.page.evaluate(
    ({ kind, files, bytes }) => {
      const data = new DataTransfer();
      for (let i = 0; i < files; i++) {
        data.items.add(new File([new Uint8Array(bytes)], `photo-${i}.png`, { type: 'image/png' }));
      }
      const root = document.querySelector('[data-tei-content]') as HTMLElement;
      const target = root.querySelector('p') ?? root;
      const rect = target.getBoundingClientRect();
      const event =
        kind === 'drop'
          ? new DragEvent('drop', {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
              clientX: rect.right - 1,
              clientY: rect.top + rect.height / 2,
            })
          : new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      // Firefox ignores `clipboardData` in the constructor; set it on the event.
      if (kind === 'paste') Object.defineProperty(event, 'clipboardData', { value: data });
      target.dispatchEvent(event);
    },
    { kind, files, bytes: [...PNG] },
  );
}

test.describe('images', () => {
  test('a click selects the image and shows its toolbar; a click elsewhere hides it', async ({
    tei,
  }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await expect(figure(tei).locator('img')).toHaveAttribute('alt', 'Hills');
    await expect(figure(tei).locator('figcaption')).toHaveText('A caption');
    await selectImage(tei);
    await expect(button(tei, 'Align centre')).toHaveAttribute('aria-pressed', 'true');
    await tei.content.getByText('After').click();
    await expect(toolbar(tei)).toHaveCount(0);
    await expect(figure(tei)).not.toHaveAttribute('data-tei-selected');
  });

  test('aligns left, right, full width and back to centre', async ({ tei }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await selectImage(tei);
    const contentBox = await tei.content.boundingBox();
    for (const [name, align] of [
      ['Align left', 'start'],
      ['Align right', 'end'],
      ['Full width', 'full'],
      ['Align centre', 'center'],
    ] as const) {
      await button(tei, name).click();
      await expect(figure(tei)).toHaveAttribute('data-align', align);
      await expect(button(tei, name)).toHaveAttribute('aria-pressed', 'true');
    }
    // Full width fills the column; the others keep their size.
    await button(tei, 'Full width').click();
    const box = await figure(tei).locator('img').boundingBox();
    expect(box?.width).toBeGreaterThan((contentBox?.width ?? 0) - 100);
    expect((await json(tei))[0]?.align).toBe('full');
  });

  test('typing in the caption; Enter goes on to the line after', async ({ tei, page }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await figure(tei).locator('figcaption').getByText('A caption').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('New caption');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Next');
    expect(await tei.html()).toBe(
      '<p>Before</p><figure><img src="/photo.svg" alt="Hills" width="300" height="180"><figcaption>New caption</figcaption></figure><p>Next</p><p>After</p>',
    );
  });

  test('typing at once after clicking from the selected image into its caption', async ({
    tei,
    page,
  }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await selectImage(tei);
    // No pause: the keys come before Lexical has turned the click into a caret.
    await figure(tei)
      .locator('figcaption')
      .getByText('A caption')
      .click({ position: { x: 1, y: 5 } });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('XY');
    await expect(figure(tei).locator('figcaption')).toHaveText('AXY caption');
  });

  test('the caption button adds a caption with the caret in it, and takes it away', async ({
    tei,
    page,
  }) => {
    await tei.open({ content: `<p>Before</p>${PHOTO}`, flags: ['image', 'plain'] });
    await expect(figure(tei).locator('figcaption')).toBeEmpty();
    await selectImage(tei);
    await button(tei, 'Caption').click();
    const caption = figure(tei).locator('figcaption');
    await expect(caption).toHaveAttribute('data-placeholder', 'Write a caption…');
    await page.keyboard.type('Typed');
    await expect(caption).toHaveText('Typed');
    await expect(button(tei, 'Caption')).toHaveAttribute('aria-pressed', 'true');
    await button(tei, 'Caption').click();
    await expect(caption).toBeEmpty();
    await expect(figure(tei)).toHaveAttribute('data-tei-selected', '');
    expect(await tei.html()).toBe(
      '<p>Before</p><img src="/photo.svg" alt="Hills" width="300" height="180">',
    );
  });

  test('Backspace in an empty caption selects the image; again deletes it', async ({
    tei,
    page,
  }) => {
    await tei.open({ content: `<p>Before</p>${PHOTO}<p>After</p>`, flags: ['image', 'plain'] });
    await selectImage(tei);
    await button(tei, 'Caption').click();
    await page.keyboard.press('Backspace');
    await expect(figure(tei)).toHaveAttribute('data-tei-selected', '');
    await page.keyboard.press('Backspace');
    await expect(figure(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Before</p><p>After</p>');
  });

  test('Delete on the toolbar removes the image; undo brings it back', async ({ tei, page }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await selectImage(tei);
    await button(tei, 'Delete image').click();
    await expect(figure(tei)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(figure(tei)).toHaveCount(1);
    await expect(figure(tei).locator('figcaption')).toHaveText('A caption');
  });

  test('alt text, from a form on the toolbar', async ({ tei, page }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await selectImage(tei);
    await toolbar(tei).locator('[data-tei-control="image-alt"]').click();
    const input = page.locator('[data-tei-control="image-alt-input"]');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Hills');
    await input.fill('Green hills under a sun');
    await input.press('Enter');
    await expect(figure(tei).locator('img')).toHaveAttribute('alt', 'Green hills under a sun');
    await expect(tei.content).toBeFocused();
  });

  test('dragging a corner resizes, keeping the proportions', async ({ tei, page }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await selectImage(tei);
    await page.locator('[data-tei-image] img').evaluate((img: HTMLImageElement) => img.decode());
    const handle = page.locator('.tei-image-handle[data-corner="se"]');
    await expect(handle).toBeVisible();
    const start = await handle.boundingBox();
    if (!start) throw new Error('no handle');
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Centred: it grows from the middle, so a 40px drag is 80px wider.
    await page.mouse.move(x - 20, y, { steps: 4 });
    await page.mouse.move(x - 40, y, { steps: 4 });
    // The toolbar steps aside while dragging.
    await expect(toolbar(tei)).toBeHidden();
    await page.mouse.up();
    await expect.poll(async () => (await json(tei))[0]?.width).toBe(220);
    expect((await json(tei))[0]?.height).toBe(132);
    await expect(figure(tei).locator('img')).toHaveAttribute('width', '220');
    await expect(toolbar(tei)).toBeVisible();
    // One undo step.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(figure(tei).locator('img')).toHaveAttribute('width', '300');
  });

  test('a handle resizes with the arrow keys', async ({ tei, page }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await selectImage(tei);
    await page.locator('[data-tei-image] img').evaluate((img: HTMLImageElement) => img.decode());
    await page.locator('.tei-image-handle[data-corner="se"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(figure(tei).locator('img')).toHaveAttribute('width', '290');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(figure(tei).locator('img')).toHaveAttribute('width', '390');
  });

  test('insert from a link, on the toolbar', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await tei.caretAtEnd();
    await page.locator('[data-tei-control="insertImage"]').click();
    const url = page.locator('[data-tei-control="image-url"]');
    await url.fill('javascript:alert(1)');
    await url.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('That is not an image link');
    await url.fill('/photo.svg');
    await url.press('Enter');
    await expect(figure(tei)).toHaveCount(1);
    await expect(tei.content).toBeFocused();
    await page.keyboard.type('Below');
    expect(await tei.html()).toBe('<p>Hello</p><img src="/photo.svg" alt=""><p>Below</p>');
  });

  test('the insert and link forms fit their popovers, on a desktop and a phone', async ({
    tei,
    page,
  }) => {
    const overflow = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-tei-part="popover"]')]
          .filter((p) => p.matches(':popover-open'))
          .map((p) => p.scrollWidth - p.clientWidth),
      );
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 700 });
      await tei.open({ flags: ['image', 'plain'] });
      await tei.selectAll();
      await page.keyboard.press('ControlOrMeta+k');
      expect(await overflow()).toEqual([0]);
      await page.keyboard.press('Escape');
      await page.locator('[data-tei-control="insertImage"]').click();
      expect(await overflow()).toEqual([0]);
    }
  });

  test('upload from the file chooser: kept as a data URL without an upload handler', async ({
    tei,
    page,
  }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await tei.caretAtEnd();
    await page.locator('[data-tei-control="insertImage"]').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-tei-control="image-upload"]').click();
    await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
    await expect(figure(tei).locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(figure(tei)).not.toHaveAttribute('data-tei-uploading');
    // The upload is part of the insert: one undo takes the image away.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(figure(tei)).toHaveCount(0);
  });

  test('upload through a handler: progress on the image, then its URL', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await page.evaluate(() => {
      const w = window as unknown as {
        finish: (src: string) => void;
        progress: (n: number) => void;
      };
      window.__tei.setImageOptions({
        upload: (_file, { onProgress }) =>
          new Promise((resolve) => {
            w.progress = onProgress;
            w.finish = (src) => resolve({ src, width: 120, height: 72 });
          }),
      });
    });
    await tei.caretAtEnd();
    await transfer(tei, 'drop', 1);
    await expect(figure(tei)).toHaveAttribute('data-tei-uploading', '');
    await expect(figure(tei).locator('img')).toHaveAttribute('src', /^blob:/);
    await page.evaluate(() =>
      (window as unknown as { progress: (n: number) => void }).progress(0.5),
    );
    await expect
      .poll(() =>
        figure(tei).evaluate((el) => (el as HTMLElement).style.getPropertyValue('--tei-progress')),
      )
      .toBe('0.5');
    await page.evaluate(() =>
      (window as unknown as { finish: (src: string) => void }).finish('/photo.svg'),
    );
    await expect(figure(tei)).not.toHaveAttribute('data-tei-uploading');
    await expect(figure(tei).locator('img')).toHaveAttribute('src', '/photo.svg');
    await expect(figure(tei).locator('img')).toHaveAttribute('width', '120');
    expect(await tei.html()).toBe(
      '<p>Hello</p><img src="/photo.svg" alt="" width="120" height="72"><p><br></p>',
    );
  });

  test('a failed upload takes the image out and reports it', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await page.evaluate(() => {
      window.__tei.setImageOptions({
        upload: () => Promise.reject(new Error('offline')),
        onUploadError: (error) => window.__tei.log.push(`${error.code}: ${error.message}`),
      });
    });
    await tei.caretAtEnd();
    await transfer(tei, 'drop', 1);
    await expect.poll(() => tei.log()).toEqual(['upload: photo-0.png could not be uploaded']);
    await expect(figure(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Hello</p><p><br></p>');
  });

  test('a pasted image file becomes an image at the caret', async ({ tei }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await tei.caretAtEnd();
    await transfer(tei, 'paste', 1);
    await expect(figure(tei).locator('img')).toHaveAttribute('src', /^data:image\/png/);
    expect(await tei.html()).toMatch(
      /^<p>Hello<\/p><img src="data:image\/png;base64,[^"]+" alt=""><p><br><\/p>$/,
    );
  });

  test('files dropped on the document become images where they land', async ({ tei }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await tei.content.click();
    await transfer(tei, 'drop', 2);
    await expect(figure(tei)).toHaveCount(2);
    await expect(figure(tei).first().locator('img')).toHaveAttribute('src', /^data:image\/png/);
  });

  test('a file too large is refused, with an error', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await page.evaluate(() =>
      window.__tei.setImageOptions({
        maxFileSize: 10,
        onUploadError: (error) => window.__tei.log.push(error.code),
      }),
    );
    await tei.caretAtEnd();
    await transfer(tei, 'drop', 1);
    await expect.poll(() => tei.log()).toEqual(['size']);
    await expect(figure(tei)).toHaveCount(0);
  });

  test('Image in the slash menu opens the insert popover at the caret', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await tei.caretAtEnd();
    await page.keyboard.press('Enter');
    await page.keyboard.type('/image');
    await page.keyboard.press('Enter');
    const popover = page.locator('[data-tei-control="image-insert-popover"]');
    await expect(popover).toBeVisible();
    await expect(popover.locator('[data-tei-control="image-upload"]')).toBeFocused();
    await popover.locator('[data-tei-control="image-url"]').fill('/photo.svg');
    await popover.locator('[data-tei-control="image-url"]').press('Enter');
    await expect(popover).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Hello</p><img src="/photo.svg" alt=""><p><br></p>');
  });

  test('Markdown: ![alt](src) on a line of its own', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await tei.caretAtEnd();
    await page.keyboard.press('Enter');
    await page.keyboard.type('![A photo](/photo.svg) ');
    await expect(figure(tei).locator('img')).toHaveAttribute('alt', 'A photo');
    await page.keyboard.type('After');
    expect(await tei.html()).toBe('<p>Hello</p><img src="/photo.svg" alt="A photo"><p>After</p>');
  });

  test('read-only: no toolbar or handles, and an empty caption takes no room', async ({
    tei,
    page,
  }) => {
    await tei.open({
      content: `<figure>${PHOTO}<figcaption>A caption</figcaption></figure>`,
      flags: ['image', 'plain'],
    });
    await selectImage(tei);
    await button(tei, 'Caption').click();
    await button(tei, 'Caption').click();
    await page.evaluate(() => window.__tei.editor.setEditable(false));
    await figure(tei).locator('img').click();
    await expect(toolbar(tei)).toHaveCount(0);
    await expect(page.locator('.tei-image-handle')).toHaveCount(0);
  });

  test('pasted HTML: an image inside a paragraph splits it', async ({ tei, page }) => {
    await tei.open({ content: '<p>Hello</p>', flags: ['image', 'plain'] });
    await page.evaluate(() =>
      window.__tei.setClipSource('<p>One <img src="/photo.svg" alt="x"> two</p>'),
    );
    await page.keyboard.press('ControlOrMeta+c');
    await tei.caretAtEnd();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(figure(tei)).toHaveCount(1);
    await settled(page);
    // Chromium writes the image's URL out in full on the clipboard.
    expect(await tei.html()).toMatch(
      /^<p>HelloOne<\/p><img src="(http:\/\/127\.0\.0\.1:3119)?\/photo\.svg" alt="x"><p>two<\/p>$/,
    );
  });

  test('tap selects the image on a phone, with larger handles @mobile', async ({ tei, page }) => {
    await tei.open({ content: FIGURE, flags: ['image', 'plain'] });
    await figure(tei).locator('img').tap();
    await expect(figure(tei)).toHaveAttribute('data-tei-selected', '');
    await expect(toolbar(tei)).toBeVisible();
    const handle = await page.locator('.tei-image-handle').first().boundingBox();
    expect(handle?.width).toBe(20);
    // The toolbar fits on screen.
    const bar = await toolbar(tei).boundingBox();
    const viewport = page.viewportSize();
    expect(bar && viewport && bar.x >= 0 && bar.x + bar.width <= viewport.width).toBe(true);
  });
});
