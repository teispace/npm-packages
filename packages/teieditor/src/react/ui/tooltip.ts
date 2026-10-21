'use client';

import { positionFloating } from './floating.js';

/**
 * One tooltip element per editor (or portal), shared by every button in
 * it: hovering along a toolbar moves one element instead of mounting a
 * popover per button. Plain DOM, so it costs no React renders at all.
 */
interface TooltipHost {
  el: HTMLDivElement;
  label: HTMLSpanElement;
  keys: HTMLSpanElement;
  stop?: () => void;
  timer?: ReturnType<typeof setTimeout>;
  owner?: Element;
}

const hosts = new WeakMap<Element, TooltipHost>();
const DELAY = 600;
/** Moving from one button to the next within this window shows the next tooltip at once. */
const WARM_WINDOW = 400;
let lastHidden = 0;
let visibleHost: TooltipHost | undefined;

function hostFor(trigger: Element): TooltipHost {
  const container =
    trigger.closest('.tei, .tei-portal, [data-tei-root]') ?? trigger.ownerDocument.body;
  let host = hosts.get(container);
  if (host?.el.isConnected) return host;
  const doc = trigger.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'tei-tooltip tei-portal';
  el.setAttribute('popover', 'manual');
  el.setAttribute('aria-hidden', 'true');
  el.dataset.teiPart = 'tooltip';
  el.dataset.teiUi = '';
  const label = doc.createElement('span');
  const keys = doc.createElement('span');
  keys.className = 'tei-kbd';
  el.append(label, keys);
  container.append(el);
  host = { el, label, keys };
  hosts.set(container, host);
  return host;
}

function reveal(host: TooltipHost, trigger: Element, text: string, shortcut?: string): void {
  host.label.textContent = text;
  host.keys.textContent = shortcut ?? '';
  host.keys.hidden = !shortcut;
  host.owner = trigger;
  host.stop?.();
  try {
    if (!host.el.matches(':popover-open')) host.el.showPopover();
  } catch {
    // No Popover API (jsdom): the element stays in the flow, hidden by CSS.
  }
  host.el.dataset.open = '';
  host.stop = positionFloating(trigger, host.el, { placement: 'top', offset: 6, padding: 6 });
  visibleHost = host;
}

/** Show the tooltip for `trigger` after the hover delay, or at once when another was just open. */
export function showTooltip(trigger: Element, text: string, shortcut?: string): void {
  if (!text) return;
  const host = hostFor(trigger);
  clearTimeout(host.timer);
  const warm = visibleHost !== undefined || performance.now() - lastHidden < WARM_WINDOW;
  if (warm) reveal(host, trigger, text, shortcut);
  else host.timer = setTimeout(() => reveal(host, trigger, text, shortcut), DELAY);
}

/** Hide the tooltip `trigger` showed (or was about to show). */
export function hideTooltip(trigger: Element): void {
  const host = hosts.get(
    trigger.closest('.tei, .tei-portal, [data-tei-root]') ?? trigger.ownerDocument.body,
  );
  if (!host) return;
  clearTimeout(host.timer);
  if (host.owner !== trigger && host.owner !== undefined) return;
  host.stop?.();
  host.stop = undefined;
  host.owner = undefined;
  delete host.el.dataset.open;
  try {
    if (host.el.matches(':popover-open')) host.el.hidePopover();
  } catch {
    // See reveal().
  }
  if (visibleHost === host) {
    visibleHost = undefined;
    lastHidden = performance.now();
  }
}
