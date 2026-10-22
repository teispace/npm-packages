/**
 * Which toolbar slots show when the entries don't all fit on one line. The
 * entries that can move into the "More" menu go from the end; the rest
 * always stay. Pure, so it is tested without a layout engine.
 */

export interface ToolbarSlot {
  kind: 'separator' | 'entry' | 'more';
  /** The group a separator precedes, or an entry belongs to. */
  group: number;
  /** For an entry that can move into the menu: its place among those that can. */
  order?: number;
}

/**
 * Which slots show when the first `keep` movable entries stay. A separator
 * shows between two groups that both show something; the "More" button shows
 * once anything has moved.
 */
export function visibleSlots(slots: readonly ToolbarSlot[], keep: number): boolean[] {
  const movable = slots.filter((s) => s.order !== undefined).length;
  const stays = (s: ToolbarSlot) => s.kind === 'entry' && (s.order === undefined || s.order < keep);
  const groups = new Set(slots.filter(stays).map((s) => s.group));
  const first = Math.min(...groups);
  return slots.map((s) => {
    if (s.kind === 'entry') return stays(s);
    if (s.kind === 'separator') return groups.has(s.group) && s.group > first;
    return keep < movable;
  });
}

/**
 * How many movable entries stay so that the shown slots fit in `available`
 * pixels, given every slot's width (all shown) and the gap between them.
 */
export function fitToolbar(
  slots: readonly ToolbarSlot[],
  widths: readonly number[],
  available: number,
  gap: number,
): number {
  const movable = slots.filter((s) => s.order !== undefined).length;
  const needs = (keep: number) => {
    const shown = visibleSlots(slots, keep);
    let total = 0;
    let count = 0;
    shown.forEach((on, i) => {
      if (!on) return;
      total += widths[i] ?? 0;
      count += 1;
    });
    return total + gap * Math.max(0, count - 1);
  };
  // Half a pixel of slack for subpixel layout.
  for (let keep = movable; keep > 0; keep -= 1) {
    if (needs(keep) <= available + 0.5) return keep;
  }
  return 0;
}
