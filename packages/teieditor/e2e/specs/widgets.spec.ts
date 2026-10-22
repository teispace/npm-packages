import { expect, type Harness, test } from './fixtures';

const poll = (tei: Harness) => tei.content.locator('[data-tei-poll]');
const fields = (tei: Harness) => poll(tei).locator('input');
const chip = (tei: Harness) => tei.content.locator('[data-tei-date-time]');
const slash = (tei: Harness) => tei.page.locator('[data-tei-control="slash-menu"]');
const picker = (tei: Harness) => tei.page.locator('[data-tei-control="date-time-picker"]');
const values = (tei: Harness) =>
  fields(tei).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

const voters = (list: string[]) => JSON.stringify(list).replace(/"/g, '&quot;');
const option = (label: string, ids: string[]) =>
  `<li data-tei-poll-option data-voters="${voters(ids)}"><span data-tei-poll-label>${label}</span></li>`;
const LUNCH = `<div data-tei-poll><p data-tei-poll-question>Lunch?</p><ul>${option('Pizza', ['a', 'b'])}${option('Soup', ['c'])}</ul></div><p>After</p>`;
const DUE = '<p>Due <time datetime="2026-10-22">Oct 22, 2026</time>!</p>';

async function open(tei: Harness, content: string) {
  await tei.page.setViewportSize({ width: 900, height: 800 });
  await tei.open({ content, flags: ['widgets', 'plain'] });
}

/** Put the caret at the end of the block whose text is `text`. */
const caretAtEndOf = (tei: Harness, text: string) =>
  tei.content.evaluate((root, wanted) => {
    const block = [...root.querySelectorAll('p')].find((b) => b.textContent === wanted);
    if (!block) throw new Error(`no block ${wanted}`);
    (root as HTMLElement).focus();
    getSelection()?.selectAllChildren(block);
    getSelection()?.collapseToEnd();
  }, text);

test.describe('poll', () => {
  test('/poll makes one and goes to its question; Enter walks the answers, adding at the end', async ({
    tei,
  }) => {
    await open(tei, '<p>Intro</p>');
    await caretAtEndOf(tei, 'Intro');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('/poll');
    await expect(slash(tei).getByRole('menuitem').first()).toContainText('Poll');
    await tei.page.keyboard.press('Enter');
    await expect(fields(tei).nth(0)).toBeFocused();
    await tei.page.keyboard.type('Lunch?');
    await tei.page.keyboard.press('Enter');
    await expect(fields(tei).nth(1)).toBeFocused();
    await tei.page.keyboard.type('Pizza');
    await tei.page.keyboard.press('Enter');
    await tei.page.keyboard.type('Soup');
    await tei.page.keyboard.press('Enter');
    // A third answer, made by Enter on the last.
    await expect(fields(tei)).toHaveCount(4);
    await expect(fields(tei).nth(3)).toBeFocused();
    await tei.page.keyboard.type('Salad');
    // Escape gives the poll back to the document, selected.
    await tei.page.keyboard.press('Escape');
    await expect(poll(tei)).toHaveAttribute('data-tei-selected', '');
    expect(await values(tei)).toEqual(['Lunch?', 'Pizza', 'Soup', 'Salad']);
    const html = await tei.html();
    expect(html).toMatch(/^<p>Intro<\/p><div data-tei-poll="">/);
    expect(html).toContain('<p data-tei-poll-question="">Lunch?</p>');
    expect(html.match(/data-tei-poll-label="">([^<]*)</g)).toEqual([
      'data-tei-poll-label="">Pizza<',
      'data-tei-poll-label="">Soup<',
      'data-tei-poll-label="">Salad<',
    ]);
    // Nothing typed reached the document's own text.
    await expect(tei.content.locator(':scope > p').first()).toHaveText('Intro');
  });

  test('a vote toggles, moves between answers, and shows live counts', async ({ tei }) => {
    await open(tei, LUNCH);
    const votes = poll(tei).locator('[data-tei-poll-vote]');
    const counts = poll(tei).locator('[data-tei-poll-count]');
    const total = poll(tei).locator('[data-tei-poll-total]');
    await expect(counts).toHaveText(['2 · 67%', '1 · 33%']);
    await expect(total).toHaveText('3 votes');
    await votes.nth(1).click();
    await expect(votes.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(counts).toHaveText(['2 · 50%', '2 · 50%']);
    await expect(total).toHaveText('4 votes');
    // One vote each: it moves.
    await votes.nth(0).click();
    await expect(votes.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(votes.nth(1)).toHaveAttribute('aria-pressed', 'false');
    await expect(counts).toHaveText(['3 · 75%', '1 · 25%']);
    // And back out.
    await votes.nth(0).click();
    await expect(counts).toHaveText(['2 · 67%', '1 · 33%']);
    // From the keyboard too.
    await votes.nth(1).focus();
    await tei.page.keyboard.press('Space');
    await expect(votes.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(poll(tei).locator('meter').nth(1)).toHaveAttribute('value', '2');
  });

  test('add and remove answers with the buttons; editing commits as focus leaves', async ({
    tei,
  }) => {
    await open(tei, LUNCH);
    const add = poll(tei).getByRole('button', { name: 'Add option' });
    await add.click();
    await expect(fields(tei)).toHaveCount(4);
    await expect(fields(tei).nth(3)).toBeFocused();
    await tei.page.keyboard.type('Salad');
    await poll(tei).getByRole('button', { name: 'Remove Pizza' }).click();
    expect(await values(tei)).toEqual(['Lunch?', 'Soup', 'Salad']);
    // Two left: neither can go, and their buttons are out of the way.
    const removes = poll(tei).locator('[data-tei-poll-remove]');
    await expect(removes).toHaveCount(2);
    for (const remove of await removes.all()) {
      await expect(remove).toBeDisabled();
      await expect(remove).toBeHidden();
    }
    await fields(tei).nth(0).fill('Dinner?');
    await fields(tei).nth(0).press('Tab');
    const html = await tei.html();
    expect(html).toContain('<p data-tei-poll-question="">Dinner?</p>');
    expect(html).toContain('Salad');
    expect(html).not.toContain('Pizza');
  });

  test('read-only shows the results; the saved HTML has the same box', async ({ tei }) => {
    await open(tei, LUNCH);
    const editing = await poll(tei).boundingBox();
    await tei.page.evaluate(() => window.__tei.editor.setEditable(false));
    await expect(poll(tei).locator('input, button')).toHaveCount(0);
    await expect(poll(tei).locator('[data-tei-poll-question]')).toHaveText('Lunch?');
    await expect(poll(tei).locator('[data-tei-poll-label]')).toHaveText(['Pizza', 'Soup']);
    const reading = await poll(tei).boundingBox();
    expect(Math.abs((reading?.height ?? 0) - (editing?.height ?? 0))).toBeLessThan(1);
    // Saved HTML on a page, as wide: as tall as the editor's.
    const saved = await tei.page.evaluate((width) => {
      const prose = document.createElement('div');
      prose.className = 'tei-prose';
      prose.style.width = `${width}px`;
      prose.innerHTML = window.__tei.trust(window.__tei.editor.getHTML());
      document.body.append(prose);
      return prose.querySelector('[data-tei-poll]')?.getBoundingClientRect().height ?? 0;
    }, editing?.width ?? 0);
    expect(Math.abs(saved - (editing?.height ?? 0))).toBeLessThan(1);
  });
});

test.describe('date', () => {
  test('/today puts today in the line, and typing goes on after it', async ({ tei }) => {
    await open(tei, '<p>Due</p>');
    await caretAtEndOf(tei, 'Due');
    await tei.page.keyboard.type(' /today');
    await expect(slash(tei).getByRole('menuitem').first()).toContainText('Today');
    await tei.page.keyboard.press('Enter');
    const today = await tei.page.evaluate(() => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    await expect(chip(tei)).toHaveAttribute('datetime', today);
    const text = await tei.page.evaluate(
      (day) =>
        new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date(`${day}T00:00:00Z`),
        ),
      today,
    );
    await expect(chip(tei)).toHaveText(text);
    await tei.page.keyboard.type(' ok');
    expect(await tei.html()).toBe(`<p>Due <time datetime="${today}">${text}</time> ok</p>`);
  });

  // The picker is <Editor>'s `dateTimePicker` part.
  test('a click opens the picker; a new day applies at once; Enter on the date opens it again', async ({
    tei,
  }) => {
    await open(tei, DUE);
    await chip(tei).click();
    await expect(picker(tei)).toBeVisible();
    const day = picker(tei).getByLabel('Date', { exact: true });
    await expect(day).toBeFocused();
    await expect(day).toHaveValue('2026-10-22');
    await day.fill('2027-01-05');
    await expect(chip(tei)).toHaveAttribute('datetime', '2027-01-05');
    await expect(chip(tei)).toHaveText('Jan 5, 2027');
    await picker(tei).getByRole('button', { name: 'Done' }).click();
    await expect(picker(tei)).toHaveCount(0);
    // Still selected: Enter opens it, Escape gives the text back.
    await expect(chip(tei)).toHaveAttribute('data-tei-selected', '');
    await tei.page.keyboard.press('Enter');
    await expect(picker(tei)).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await expect(picker(tei)).toHaveCount(0);
    await expect(tei.content).toBeFocused();
    await tei.page.keyboard.type('x');
    expect(await tei.html()).toBe('<p>Due <time datetime="2027-01-05">Jan 5, 2027</time>x!</p>');
  });

  test('the picker adds a time, and takes the date out', async ({ tei }) => {
    await open(tei, DUE);
    await chip(tei).click();
    await picker(tei).getByRole('switch', { name: 'Include time' }).check();
    const time = picker(tei).getByLabel('Time', { exact: true });
    await expect(time).toHaveValue('09:00');
    await time.fill('14:45');
    const iso = await tei.page.evaluate(() => new Date(2026, 9, 22, 14, 45).toISOString());
    await expect(chip(tei)).toHaveAttribute('datetime', iso);
    await expect(chip(tei)).toContainText('2:45');
    await picker(tei).getByRole('button', { name: 'Remove date' }).click();
    await expect(picker(tei)).toHaveCount(0);
    await expect(chip(tei)).toHaveCount(0);
    expect(await tei.html()).toBe('<p>Due !</p>');
  });
});
