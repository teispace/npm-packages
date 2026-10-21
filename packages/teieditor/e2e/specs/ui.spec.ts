import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, type Harness, test } from './fixtures';

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

/** Wait for every running animation and transition to finish. */
async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
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

test.describe('tooltip', () => {
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
    await tei.page.locator('[data-item="bold"]').tap();
    expect(await tei.html()).toBe('<p><strong>word</strong></p>');
    await expect(tei.page.locator('[data-tei-part="tooltip"]')).toBeHidden();
  });
});
