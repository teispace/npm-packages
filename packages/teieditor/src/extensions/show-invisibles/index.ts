import { effect } from '@lexical/extension';
import {
  $getNearestNodeFromDOMNode,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isTabNode,
  $isTextNode,
  getDOMTextNode,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
} from 'lexical';
import { defineTeiExtension, setExtensionOptions } from '../../core/define.js';
import { pilcrow } from '../../icons/index.js';
import { createOverlay, frameScheduler, place } from '../../utils/overlay.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Show or hide non-printing characters. */
    toggleInvisibles: [];
  }
  interface TeiActiveStates {
    invisibles: [];
  }
}

export interface ShowInvisiblesOptions {
  /** Whether the marks show. Off by default; `toggleInvisibles` flips it. */
  enabled: boolean;
}

/** A mark to draw: its kind, where, and whether its line runs right to left. */
type Mark = [kind: 'space' | 'tab' | 'break' | 'end', rect: DOMRect, rtl: boolean];

const isRtl = (el: Element): boolean => {
  try {
    return el.matches(':dir(rtl)');
  } catch {
    return false;
  }
};

/** Leaf blocks hold text, not other blocks: where a ¶ goes. */
const isLeafBlock = (node: LexicalNode): boolean =>
  $isElementNode(node) &&
  !node.isInline() &&
  node.getChildren().every((child) => !$isElementNode(child) || child.isInline());

/** The marks for the blocks on screen, from the DOM Lexical rendered for them. */
function measure(lexical: LexicalEditor, root: HTMLElement): Mark[] {
  const blocks = root.children;
  const height = root.ownerDocument.defaultView?.innerHeight ?? 0;
  // The first block on screen, by halving: only what shows is measured.
  let lo = 0;
  let hi = blocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((blocks[mid] as Element).getBoundingClientRect().bottom < 0) lo = mid + 1;
    else hi = mid;
  }
  const shown: Element[] = [];
  for (let i = lo; i < blocks.length; i++) {
    const block = blocks[i] as Element;
    if (block.getBoundingClientRect().top > height) break;
    shown.push(block);
  }
  const marks: Mark[] = [];
  const range = root.ownerDocument.createRange();
  const visit = (node: LexicalNode, rtl: boolean) => {
    const dom = lexical.getElementByKey(node.getKey());
    if (!dom || $isDecoratorNode(node)) return;
    if ($isTabNode(node)) {
      marks.push(['tab', dom.getBoundingClientRect(), rtl]);
    } else if ($isTextNode(node)) {
      const text = getDOMTextNode(dom);
      if (!text) return;
      for (const match of text.data.matchAll(/[  ]/g)) {
        range.setStart(text, match.index);
        range.setEnd(text, match.index + 1);
        marks.push(['space', range.getBoundingClientRect(), rtl]);
      }
    } else if ($isLineBreakNode(node)) {
      range.setStartBefore(dom);
      range.collapse(true);
      marks.push(['break', range.getBoundingClientRect(), rtl]);
    } else if ($isElementNode(node)) {
      const leaf = isLeafBlock(node);
      const dir = leaf ? isRtl(dom) : rtl;
      for (const child of node.getChildren()) visit(child, dir);
      if (!leaf) return;
      // The ¶ after the block's last character, or where an empty one starts.
      const last = node.getLastDescendant();
      const end = last && $isTextNode(last) ? lexical.getElementByKey(last.getKey()) : null;
      const text = end && getDOMTextNode(end);
      if (text) {
        range.setStart(text, text.data.length);
        range.collapse(true);
        marks.push(['end', range.getBoundingClientRect(), dir]);
      } else {
        const br = dom.lastElementChild?.tagName === 'BR' ? dom.lastElementChild : null;
        const box = (br ?? dom).getBoundingClientRect();
        marks.push(['end', br ? box : new DOMRect(dir ? box.right : box.left, box.top, 0, 0), dir]);
      }
    }
  };
  lexical.getEditorState().read(
    () => {
      for (const block of shown) {
        const node = $getNearestNodeFromDOMNode(block);
        if (node) visit(node, false);
      }
    },
    { editor: lexical },
  );
  return marks;
}

/** Draw the marks while on: from the next frame after each change, scroll or resize. */
function show(lexical: LexicalEditor): () => void {
  let layer: HTMLElement | null = null;
  let observer: ResizeObserver | null = null;
  const pool: HTMLElement[] = [];
  const frame = frameScheduler(() => {
    const root = lexical.getRootElement();
    if (!root?.isConnected) return;
    if (!layer?.isConnected) {
      layer = createOverlay(root, 'tei-invisibles');
      pool.length = 0;
    }
    // Every read first, then every write: one layout per frame.
    const marks = measure(lexical, root);
    const origin = layer.getBoundingClientRect();
    marks.forEach(([kind, rect, rtl], i) => {
      let mark = pool[i];
      if (!mark) {
        mark = root.ownerDocument.createElement('span');
        mark.className = 'tei-invisible';
        pool.push(mark);
        layer?.append(mark);
      }
      mark.hidden = false;
      mark.setAttribute('data-kind', kind);
      mark.toggleAttribute('data-rtl', rtl);
      const x = (kind === 'end' || kind === 'break') && !rtl ? rect.right : rect.left;
      place(mark, x - origin.left, rect.top - origin.top);
      mark.style.width = kind === 'space' || kind === 'tab' ? `${rect.width}px` : '';
      mark.style.height = `${rect.height}px`;
      mark.style.lineHeight = `${rect.height}px`;
    });
    for (let i = marks.length; i < pool.length; i++) (pool[i] as HTMLElement).hidden = true;
  });
  const schedule = frame.schedule;
  let win: Window | null = null;
  const detach = () => {
    observer?.disconnect();
    layer?.remove();
    layer = null;
    win?.removeEventListener('scroll', schedule, { capture: true });
    win?.removeEventListener('resize', schedule);
    win = null;
  };
  return mergeRegister(
    lexical.registerUpdateListener(schedule),
    lexical.registerRootListener((root, previous) => {
      previous?.removeAttribute('data-tei-invisibles');
      detach();
      if (!root) return;
      root.setAttribute('data-tei-invisibles', '');
      win = root.ownerDocument.defaultView;
      // Capturing: a scroll in any container moves the text under the marks.
      win?.addEventListener('scroll', schedule, { capture: true, passive: true });
      win?.addEventListener('resize', schedule, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(schedule);
        observer.observe(root);
      }
      schedule();
    }),
    () => {
      frame.cancel();
      detach();
      lexical.getRootElement()?.removeAttribute('data-tei-invisibles');
    },
  );
}

/**
 * Non-printing characters, shown: · for a space, → for a tab, ↵ for a line
 * break, ¶ at the end of each block. The marks are drawn in a layer over
 * the document, from CSS, so they are never saved, selected or copied,
 * and only the blocks on screen are measured. Off, it costs nothing.
 */
export const ShowInvisibles = defineTeiExtension({
  name: '@teispace/teieditor/show-invisibles',
  config: { enabled: false } as ShowInvisiblesOptions,
  commands: {
    toggleInvisibles: {
      run: ({ editor, options }) => {
        setExtensionOptions(editor, ShowInvisibles, { enabled: !options.enabled });
      },
    },
  },
  active: { invisibles: ({ options }) => options.enabled },
  register: ({ lexical, options }) => effect(() => (options.enabled ? show(lexical) : undefined)),
  icons: { invisibles: pilcrow },
  messages: { 'view.invisibles': 'Show invisibles' },
  items: [
    {
      id: 'invisibles',
      label: 'view.invisibles',
      icon: 'invisibles',
      in: ['document'],
      group: 'view',
      order: 10,
      command: 'toggleInvisibles',
      active: 'invisibles',
    },
  ],
});
