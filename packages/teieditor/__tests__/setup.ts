// Global test setup for teieditor. jsdom is configured in vitest.config.ts.
//
// jsdom hides `[popover]` elements with its UA stylesheet but has neither
// the Popover API nor `<dialog>.showModal()`. These shims stand in for the
// browser just enough for the UI tests; the real behaviour is covered by
// the Playwright suite in three browsers.

// The SSR suite runs in Node, with no DOM to shim.
const inDom = typeof HTMLElement !== 'undefined';

const proto = (inDom ? HTMLElement.prototype : {}) as HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};
if (inDom && typeof proto.showPopover !== 'function') {
  proto.showPopover = function showPopover(this: HTMLElement) {
    this.dataset.shimPopoverOpen = '';
  };
  proto.hidePopover = function hidePopover(this: HTMLElement) {
    delete this.dataset.shimPopoverOpen;
  };
  const style = document.createElement('style');
  style.textContent =
    '[popover][data-open], [popover][data-shim-popover-open] { display: block !important; }';
  document.head.append(style);
}

const dialog = (inDom ? HTMLDialogElement.prototype : {}) as HTMLDialogElement;
if (inDom && typeof dialog.showModal !== 'function') {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialog.show = dialog.showModal;
  dialog.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
