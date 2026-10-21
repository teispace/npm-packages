import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, type Harness, settled, test } from './fixtures';

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not rendered');
  return b;
}

/** Fully inside the viewport, with the popover's 8px edge padding. */
async function expectInViewport(page: Page, b: Box, padding = 8) {
  const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
  expect(b.x).toBeGreaterThanOrEqual(padding - 1);
  expect(b.y).toBeGreaterThanOrEqual(padding - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(width - padding + 1);
  expect(b.y + b.height).toBeLessThanOrEqual(height - padding + 1);
}

const menu = (page: Page) =>
  page.locator('[data-tei-part="popover"]:popover-open [role="menu"]').first();
const popovers = (page: Page) => page.locator('[data-tei-part="popover"]:popover-open');

async function openMenu(tei: Harness, trigger = 'menu-trigger') {
  await tei.page.getByTestId(trigger).click();
  await expect(menu(tei.page)).toBeVisible();
  await settled(tei.page);
}

test.describe('dropdown menu', () => {
  test('opens in the top layer, right under its button, aligned to its start edge', async ({
    tei,
  }) => {
    await tei.open();
    await openMenu(tei);
    const trigger = await box(tei.page.getByTestId('menu-trigger'));
    const popover = await box(popovers(tei.page));
    expect(popover.y - (trigger.y + trigger.height)).toBeCloseTo(6, 0);
    expect(popover.x).toBeCloseTo(trigger.x, 0);
    await expectInViewport(tei.page, popover);
    await expect(tei.page.getByTestId('menu-trigger')).toHaveAttribute('aria-expanded', 'true');
  });

  test('is in place on its first painted frame: no jump, no flash at the corner', async ({
    tei,
  }) => {
    await tei.open();
    // Record the popover's box on every frame from the click on.
    await tei.page.evaluate(() => {
      const frames: Array<{ x: number; y: number; opacity: number }> = [];
      (window as { __frames?: typeof frames }).__frames = frames;
      const sample = () => {
        const el = document.querySelector<HTMLElement>('[data-tei-part="popover"]');
        if (el?.matches(':popover-open')) {
          const r = el.getBoundingClientRect();
          frames.push({ x: r.x, y: r.y, opacity: Number(getComputedStyle(el).opacity) });
        }
        if (frames.length < 20) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await tei.page.getByTestId('menu-trigger').click();
    await expect
      .poll(() =>
        tei.page.evaluate(() => (window as { __frames?: unknown[] }).__frames?.length ?? 0),
      )
      .toBeGreaterThanOrEqual(10);
    const frames = await tei.page.evaluate(
      () =>
        (window as unknown as { __frames: Array<{ x: number; y: number; opacity: number }> })
          .__frames,
    );
    const last = frames.at(-1) as { x: number; y: number };
    for (const frame of frames) {
      // The enter animation may fade and nudge by a few px, never jump.
      expect(Math.abs(frame.x - last.x)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(frame.y - last.y)).toBeLessThanOrEqual(5);
    }
    expect(frames.at(-1)?.opacity).toBe(1);
  });

  test('keyboard: ArrowDown opens on the first item, skips disabled, Enter runs, focus returns', async ({
    tei,
  }) => {
    await tei.open();
    const trigger = tei.page.getByTestId('menu-trigger');
    await trigger.focus();
    await tei.page.keyboard.press('ArrowDown');
    const highlighted = () => menu(tei.page).locator('[data-highlighted]').innerText();
    await expect(menu(tei.page)).toBeVisible();
    expect(await highlighted()).toContain('One');
    await tei.page.keyboard.press('ArrowDown');
    expect(await highlighted()).toContain('Two');
    await tei.page.keyboard.press('ArrowDown');
    // "Disabled" is skipped.
    expect(await highlighted()).toContain('More');
    await tei.page.keyboard.press('ArrowUp');
    await tei.page.keyboard.press('Enter');
    await expect(popovers(tei.page)).toHaveCount(0);
    expect(await tei.log()).toEqual(['two']);
    await expect(trigger).toBeFocused();
  });

  test('Escape closes and gives focus back; a click outside closes', async ({ tei }) => {
    await tei.open();
    const trigger = tei.page.getByTestId('menu-trigger');
    await trigger.focus();
    await tei.page.keyboard.press('Enter');
    await expect(menu(tei.page)).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await expect(popovers(tei.page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await openMenu(tei);
    await tei.page.mouse.click(5, 5);
    await expect(popovers(tei.page)).toHaveCount(0);
  });

  test('a submenu opens beside its row, and Escape closes only it', async ({ tei }) => {
    await tei.open();
    await tei.page.getByTestId('menu-trigger').focus();
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.press('ArrowUp'); // wraps to the last enabled item of the first group…
    // …so walk to "More" by typing its name instead.
    await tei.page.keyboard.type('Mo');
    await tei.page.keyboard.press('ArrowRight');
    await expect(popovers(tei.page)).toHaveCount(2);
    const row = await box(menu(tei.page).getByRole('menuitem', { name: /More/ }));
    const sub = await box(popovers(tei.page).nth(1));
    // Beside the row (either side, if there is no room), overlapping it vertically.
    expect(sub.x >= row.x + row.width - 2 || sub.x + sub.width <= row.x + 2).toBe(true);
    expect(sub.y).toBeLessThan(row.y + row.height);
    await expectInViewport(tei.page, sub);
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.press('Enter');
    await expect(popovers(tei.page)).toHaveCount(0);
    expect(await tei.log()).toEqual(['sub-b']);

    await tei.page.getByTestId('menu-trigger').focus();
    await tei.page.keyboard.press('ArrowDown');
    await tei.page.keyboard.type('Mo');
    await tei.page.keyboard.press('ArrowRight');
    await expect(popovers(tei.page)).toHaveCount(2);
    await tei.page.keyboard.press('Escape');
    await expect(popovers(tei.page)).toHaveCount(1);
    await tei.page.keyboard.press('Escape');
    await expect(popovers(tei.page)).toHaveCount(0);
  });

  test('flips and shifts to stay on screen from a corner', async ({ tei }) => {
    await tei.open();
    await openMenu(tei, 'corner-trigger');
    const trigger = await box(tei.page.getByTestId('corner-trigger'));
    const popover = await box(popovers(tei.page));
    // No room below: it opens above.
    expect(popover.y + popover.height).toBeLessThanOrEqual(trigger.y + 1);
    await expectInViewport(tei.page, popover);
    await expect(popovers(tei.page)).toHaveAttribute('data-side', 'top');
  });

  test('grows out of its button: the transform origin sits on the anchor side', async ({ tei }) => {
    const origin = async () => {
      const [x, y] = (
        await popovers(tei.page).evaluate((el) => getComputedStyle(el).transformOrigin)
      )
        .split(' ')
        .map(Number.parseFloat);
      return { x: x as number, y: y as number };
    };
    await tei.open();
    await openMenu(tei);
    let trigger = await box(tei.page.getByTestId('menu-trigger'));
    let popover = await box(popovers(tei.page));
    let o = await origin();
    expect(o.y).toBeCloseTo(0, 0);
    expect(popover.x + o.x).toBeCloseTo(trigger.x + trigger.width / 2, 0);
    await tei.page.keyboard.press('Escape');

    // Flipped above its button: it grows upwards from its bottom edge.
    await openMenu(tei, 'corner-trigger');
    trigger = await box(tei.page.getByTestId('corner-trigger'));
    popover = await box(popovers(tei.page));
    o = await origin();
    expect(o.y).toBeCloseTo(popover.height, 0);
    expect(popover.x + o.x).toBeCloseTo(trigger.x + trigger.width / 2, 0);
  });

  test('stays attached to its button while the page scrolls and resizes', async ({ tei }) => {
    await tei.open({ flags: ['tall'] });
    await openMenu(tei);
    const trigger = tei.page.getByTestId('menu-trigger');
    const before = { t: await box(trigger), p: await box(popovers(tei.page)) };
    await tei.page.mouse.wheel(0, 60);
    await expect.poll(async () => (await box(trigger)).y).toBeLessThan(before.t.y - 30);
    await expect
      .poll(async () => (await box(popovers(tei.page))).y - (await box(trigger)).y)
      .toBeCloseTo(before.p.y - before.t.y, 0);
    await tei.page.setViewportSize({ width: 420, height: 600 });
    await expect
      .poll(async () => {
        const p = await box(popovers(tei.page));
        return p.x + p.width <= 420 - 7;
      })
      .toBe(true);
  });

  test('reduced motion: it appears without animating', async ({ tei }) => {
    await tei.page.emulateMedia({ reducedMotion: 'reduce' });
    await tei.open();
    await openMenu(tei);
    const duration = await popovers(tei.page).evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );
    expect(duration.split(',').every((d) => Number.parseFloat(d) === 0)).toBe(true);
  });
});

test.describe('dialog', () => {
  test('opens modal with focus inside, traps Tab, and Escape gives focus back', async ({ tei }) => {
    await tei.open();
    const trigger = tei.page.getByTestId('dialog-trigger');
    await trigger.click();
    const dialog = tei.page.getByRole('dialog', { name: 'Insert link' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.matches(':modal'))).toBe(true);
    await expect(tei.page.getByTestId('dialog-input')).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await tei.page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await tei.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('the description sits right under the title', async ({ tei }) => {
    await tei.open();
    await tei.page.getByTestId('dialog-trigger').click();
    await settled(tei.page);
    const title = await box(tei.page.locator('dialog[open] h2'));
    const description = await box(tei.page.locator('dialog[open] .tei-dialog-description'));
    expect(description.y - (title.y + title.height)).toBeGreaterThanOrEqual(0);
    expect(description.y - (title.y + title.height)).toBeLessThanOrEqual(8);
    expect(description.x).toBeCloseTo(title.x, 0);
  });

  test('Enter submits; it is centred and fits a phone', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 360, height: 640 });
    await tei.open();
    await tei.page.getByTestId('dialog-trigger').click();
    const dialog = tei.page.getByRole('dialog', { name: 'Insert link' });
    await settled(tei.page);
    const b = await box(dialog);
    await expectInViewport(tei.page, b, 0);
    expect(Math.abs(b.x + b.width / 2 - 180)).toBeLessThanOrEqual(1);
    await tei.page.getByTestId('dialog-input').fill('https://x.example');
    await tei.page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    expect(await tei.log()).toEqual(['dialog submit']);
  });
});

test.describe('theme', () => {
  test('menus, dialogs and tooltips follow a dark ancestor, like the editor', async ({ tei }) => {
    const scheme = (selector: string) =>
      tei.page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).colorScheme);
    await tei.open();
    await tei.page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    expect(await scheme('[data-testid="editor"]')).toBe('dark');
    await openMenu(tei);
    expect(await scheme('[data-tei-part="popover"]:popover-open')).toBe('dark');
    await tei.page.keyboard.press('Escape');
    await tei.page.getByTestId('dialog-trigger').click();
    expect(await scheme('dialog[open]')).toBe('dark');
    await tei.page.keyboard.press('Escape');
    await tei.page.locator('[data-item="bold"]').hover();
    await expect(tei.page.locator('[data-tei-part="tooltip"]')).toBeVisible();
    expect(await scheme('[data-tei-part="tooltip"]')).toBe('dark');
  });

  test('a menu list draws no ring of its own: its highlighted row shows focus', async ({ tei }) => {
    await tei.open();
    await tei.page.getByTestId('menu-trigger').focus();
    await tei.page.keyboard.press('ArrowDown');
    await expect(menu(tei.page)).toBeFocused();
    expect(await menu(tei.page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
    await expect(menu(tei.page).locator('[data-highlighted]')).toHaveCount(1);
  });
});

test.describe('toolbar', () => {
  test('a toolbar that scrolls fades out at the edge with more beyond it', async ({ tei }) => {
    const fades = () =>
      tei.page.locator('[data-tei-part="toolbar"]').evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          start: Number.parseFloat(style.getPropertyValue('--tei-fade-start')),
          end: Number.parseFloat(style.getPropertyValue('--tei-fade-end')),
        };
      });
    await tei.open({ flags: ['scroll'] });
    test.skip(
      !(await tei.page.evaluate(() => CSS.supports('animation-timeline: scroll()'))),
      'no scroll-driven animations in this engine',
    );
    // Wide: everything fits, nothing fades.
    expect(await fades()).toEqual({ start: 0, end: 0 });

    await tei.page.setViewportSize({ width: 375, height: 700 });
    await expect.poll(fades).toEqual({ start: 0, end: 24 });
    await tei.page.locator('[data-tei-part="toolbar"]').evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect.poll(fades).toEqual({ start: 24, end: 0 });
  });
});

test.describe('toolbar overflow', () => {
  const toolbar = (tei: Harness) =>
    tei.page.getByRole('toolbar', { name: 'Formatting', exact: true });
  const more = (tei: Harness) => toolbar(tei).locator('[data-tei-control="more"]');
  /** Each shown control's box, and the toolbar's content box. */
  const layout = (tei: Harness) =>
    toolbar(tei).evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const shown = [
        ...el.querySelectorAll(':scope > [data-tei-slot]:not([hidden]) > :not([popover])'),
      ];
      return {
        left: box.left + Number.parseFloat(style.paddingLeft),
        right: box.right - Number.parseFloat(style.paddingRight),
        // One line: every control centred on the same row (separators have margins).
        rows: [
          ...new Set(
            shown.map((c) => {
              const r = c.getBoundingClientRect();
              return Math.round((r.top + r.bottom) / 2);
            }),
          ),
        ],
        boxes: shown.map((c) => c.getBoundingClientRect()).map((r) => [r.left, r.right]),
        moved: [...el.querySelectorAll(':scope > [data-tei-slot][hidden] [data-item]')].map((c) =>
          c.getAttribute('data-item'),
        ),
      };
    });

  test('a wide toolbar shows everything and no More button', async ({ tei }) => {
    await tei.open();
    await expect(more(tei)).toBeHidden();
    const { rows, moved } = await layout(tei);
    expect(rows).toHaveLength(1);
    expect(moved).toEqual([]);
  });

  for (const width of [320, 375, 768]) {
    test(`at ${width}px: one line, inside the frame, the rest in More`, async ({ tei }) => {
      await tei.page.setViewportSize({ width, height: 800 });
      await tei.open();
      await expect(more(tei)).toBeVisible();
      const { left, right, rows, boxes, moved } = await layout(tei);
      expect(rows).toHaveLength(1);
      for (const [start, end] of boxes) {
        expect(start).toBeGreaterThanOrEqual(left - 0.5);
        expect(end).toBeLessThanOrEqual(right + 0.5);
      }
      expect(moved.length).toBeGreaterThan(0);
      // Nearly full: the next entry would not have fitted.
      const last = boxes.at(-1)?.[1] ?? 0;
      expect(right - last).toBeLessThan(80);
      // Everything moved is in the menu, under its own name (a menu control's, without its value).
      await more(tei).click();
      const menu = tei.page.getByRole('menu', { name: 'More' });
      await expect(menu).toBeVisible();
      for (const id of moved) {
        const label = await toolbar(tei).locator(`[data-item="${id}"]`).getAttribute('aria-label');
        const name = (label ?? '').split(':')[0] ?? '';
        await expect(
          menu.locator('[role^="menuitem"]').filter({ hasText: name }).first(),
        ).toBeVisible();
      }
      expect(await tei.problems()).toEqual([]);
    });
  }

  test('a moved item runs from the menu on the selection, which keeps its state', async ({
    tei,
  }) => {
    await tei.page.setViewportSize({ width: 320, height: 800 });
    await tei.open({ content: '<p>word</p>' });
    expect((await layout(tei)).moved).toContain('strike');
    await tei.selectAll();
    await more(tei).click();
    const menu = tei.page.getByRole('menu', { name: 'More' });
    await menu.getByRole('menuitemcheckbox', { name: /Strikethrough/ }).click();
    expect(await tei.html()).toBe('<p><s>word</s></p>');
    await more(tei).click();
    await expect(menu.getByRole('menuitemcheckbox', { name: /Strikethrough/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('the keyboard reaches More last, skipping what moved, and opens it', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 375, height: 800 });
    await tei.open();
    await toolbar(tei).locator('[data-item="bold"]').focus();
    await tei.page.keyboard.press('End');
    await expect(more(tei)).toBeFocused();
    await tei.page.keyboard.press('ArrowRight');
    await expect(more(tei)).not.toBeFocused();
    await tei.page.keyboard.press('ArrowLeft');
    await expect(more(tei)).toBeFocused();
    await tei.page.keyboard.press('ArrowDown');
    await expect(tei.page.getByRole('menu', { name: 'More' })).toBeVisible();
    await tei.page.keyboard.press('Escape');
    await expect(more(tei)).toBeFocused();
  });

  test('on a phone, the menu and a submenu stay on the screen', async ({ tei }) => {
    await tei.page.setViewportSize({ width: 320, height: 640 });
    await tei.open();
    await more(tei).click();
    const menu = tei.page.getByRole('menu', { name: 'More' });
    await settled(tei.page);
    await menu.locator('[role="menuitem"][aria-haspopup="menu"]').last().hover();
    const open = tei.page.locator('[data-tei-part="popover"]:popover-open');
    await expect(open).toHaveCount(2);
    await settled(tei.page);
    for (const box of await open.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON()),
    )) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(320);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(640);
    }
  });

  test('growing gives entries back, shrinking takes them, with no wrap on the way', async ({
    tei,
  }) => {
    await tei.page.setViewportSize({ width: 1280, height: 800 });
    await tei.open();
    for (const width of [900, 600, 420, 360, 500, 1000, 1280]) {
      await tei.page.setViewportSize({ width, height: 800 });
      // Refits within a frame or two of the resize: one row, the last control inside.
      await expect
        .poll(async () => {
          const { right, rows, boxes } = await layout(tei);
          return rows.length === 1 && (boxes.at(-1)?.[1] ?? 0) <= right + 0.5;
        })
        .toBe(true);
    }
    await expect(more(tei)).toBeHidden();
    expect((await layout(tei)).moved).toEqual([]);
  });
});

test.describe('tooltip', () => {
  test('one tooltip on screen at a time, across editors and portals', async ({ tei }) => {
    await tei.open();
    const tips = tei.page.locator('[data-tei-part="tooltip"]:popover-open');
    // Keyboard focus shows a tooltip that no pointer leave will hide.
    // (Focus after a key press is keyboard focus everywhere; Safari's Tab skips buttons.)
    await tei.page.keyboard.press('Shift');
    await tei.page.getByTestId('color-trigger').focus();
    await expect(tips).toHaveCount(1);
    await expect(tips).toContainText('Colour');
    await tei.page.locator('[data-item="bold"]').hover();
    await expect(tips).toHaveCount(1);
    await expect(tips).toContainText('Bold');
  });

  test('no tooltip that only repeats the visible text', async ({ tei }) => {
    await tei.open();
    await tei.page.getByTestId('menu-trigger').hover();
    await tei.page.waitForTimeout(800);
    await expect(tei.page.locator('[data-tei-part="tooltip"]:popover-open')).toHaveCount(0);
  });

  test('shows the label and shortcut on hover, beside the button, and hides on leave', async ({
    tei,
  }) => {
    await tei.open();
    const bold = tei.page.locator('[data-item="bold"]');
    await bold.hover();
    const tooltip = tei.page.locator('[data-tei-part="tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Bold');
    await expect(tooltip).toContainText(/⌘B|Ctrl\+B/);
    const t = await box(tooltip);
    const b = await box(bold);
    // Not covering the button.
    expect(t.y + t.height <= b.y + 1 || t.y >= b.y + b.height - 1).toBe(true);
    await tei.page.mouse.move(2, 400);
    await expect(tooltip).toBeHidden();
  });
});

test.describe('pickers', () => {
  test('colour: a swatch applies and closes; the trigger shows it', async ({ tei }) => {
    await tei.open();
    await tei.page.getByTestId('color-trigger').click();
    await tei.page.getByRole('button', { name: 'Blue' }).click();
    await expect(popovers(tei.page)).toHaveCount(0);
    await expect(tei.page.getByTestId('color-trigger')).toContainText('#1971c2');
  });

  test('grid: hovering sizes the selection, a click picks it', async ({ tei }) => {
    await tei.open();
    await tei.page.getByTestId('grid-trigger').click();
    const cell = tei.page.getByRole('button', { name: /3\D+4/ }).first();
    await cell.hover();
    await cell.click();
    expect(await tei.log()).toEqual(['grid 3x4']);
  });
});

test.describe('accessibility', () => {
  for (const state of ['page', 'menu', 'dialog'] as const) {
    test(`no serious axe issues: ${state}`, async ({ tei }) => {
      await tei.open();
      if (state === 'menu') await openMenu(tei);
      if (state === 'dialog') await tei.page.getByTestId('dialog-trigger').click();
      await settled(tei.page);
      const results = await new AxeBuilder({ page: tei.page }).analyze();
      const serious = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(serious).toEqual([]);
    });
  }
});

test.describe('responsive @mobile', () => {
  test('nothing scrolls sideways, and menus fit the screen', async ({ tei }) => {
    await tei.open();
    expect(await tei.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await tei.page.getByTestId('menu-trigger').tap();
    await expect(menu(tei.page)).toBeVisible();
    await expectInViewport(tei.page, await box(popovers(tei.page)));
  });

  test('touch: tapping a toolbar button formats without a tooltip in the way', async ({ tei }) => {
    await tei.open({ content: '<p>word</p>' });
    await tei.content.tap();
    await tei.page.evaluate(() => {
      const root = document.querySelector('[data-tei-content]') as HTMLElement;
      getSelection()?.selectAllChildren(root);
    });
    await tei.page
      .getByRole('toolbar', { name: 'Formatting', exact: true })
      .locator('[data-item="bold"]')
      .tap();
    expect(await tei.html()).toBe('<p><strong>word</strong></p>');
    await expect(tei.page.locator('[data-tei-part="tooltip"]')).toBeHidden();
  });
});
