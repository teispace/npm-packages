import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import type { ElementTransformer } from '@lexical/markdown';
import {
  $create,
  $getDocument,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { TeiEditor } from '../../core/editor.js';
import {
  $canInsertBlock,
  $caretAfter,
  $insertBlockAtSelection,
  $liftBlock,
  $removeBlockHost,
  registerHostSelection,
  registerSelectedAttribute,
} from '../../core/slot-host.js';
import { pageBreak } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    insertPageBreak: [];
    removePageBreak: [key?: NodeKey];
  }
}

/**
 * Where a printed page ends. The editor shows it as a labelled rule; print
 * (and a PDF made from the page) starts a new page after it. Saved as
 * `<hr data-tei-page-break>`, which `styles.css` breaks the page after.
 */
export class PageBreakNode extends DecoratorNode<null> {
  $config() {
    return this.config('page-break', { extends: DecoratorNode });
  }

  createDOM(config: EditorConfig): HTMLElement {
    const doc = $getDocument();
    const box = doc.createElement('div');
    box.className = (config.theme.pageBreak as string | undefined) ?? 'tei-page-break';
    box.setAttribute('contenteditable', 'false');
    box.setAttribute('data-tei-page-break', '');
    box.setAttribute('role', 'separator');
    const label = doc.createElement('span');
    label.className = 'tei-page-break-label';
    label.textContent = TeiEditor.of($getEditor())?.t('block.pageBreak') ?? 'Page break';
    box.setAttribute('aria-label', label.textContent);
    box.append(label);
    return box;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const hr = $getDocument().createElement('hr');
    hr.setAttribute('data-tei-page-break', '');
    return { element: hr };
  }

  decorate(): null {
    return null;
  }

  isInline(): false {
    return false;
  }

  getTextContent(): string {
    return '\n';
  }
}

export function $createPageBreakNode(): PageBreakNode {
  return $create(PageBreakNode);
}

export function $isPageBreakNode(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}

/** A page break in another's words: CSS on a rule (Google Docs) or Lexical's own. */
const BREAKS =
  /(?:^|;)\s*(?:page-break-(?:before|after)\s*:\s*always|break-(?:before|after)\s*:\s*page)/i;

/** `<hr data-tei-page-break>`, Lexical's `<hr data-lexical-page-break>` and Google Docs' `<hr style="page-break-before:always">`. */
const PAGE_BREAK_RULE = defineImportRule({
  name: '@teispace/teieditor/page-break',
  match: sel.tag('hr'),
  $import: (_ctx, el, $next) =>
    el.hasAttribute('data-tei-page-break') ||
    el.hasAttribute('data-lexical-page-break') ||
    BREAKS.test(el.getAttribute('style') ?? '')
      ? [$createPageBreakNode()]
      : $next(),
});

/**
 * `<!-- page-break -->` on a line of its own; `\pagebreak` and `\newpage`
 * (Pandoc's) read too.
 */
export const PAGE_BREAK: ElementTransformer = {
  dependencies: [PageBreakNode],
  export: (node) => ($isPageBreakNode(node) ? '<!-- page-break -->' : null),
  regExp: /^(?:<!--\s*page-?break\s*-->|\\pagebreak|\\newpage)\s*$/i,
  replace: (parent, _children, _match, isImport) => {
    const node = $createPageBreakNode();
    if (isImport || parent.getNextSibling() !== null) parent.replace(node);
    else parent.insertBefore(node);
    node.selectNext();
  },
  type: 'element',
};

/** The page break the command means: the one keyed, or the one selected. */
function $getPageBreak(key?: NodeKey): PageBreakNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isPageBreakNode(node) ? node : null;
  }
  const selection = $getSelection();
  const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
  return nodes.length === 1 && $isPageBreakNode(nodes[0]) ? nodes[0] : null;
}

/**
 * Page breaks, for documents that get printed. ⌘↵ inserts one, as in Word
 * and Google Docs; so do the slash and insert menus.
 */
export const PageBreak = defineTeiExtension({
  name: '@teispace/teieditor/page-break',
  nodes: [PageBreakNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [PAGE_BREAK_RULE] })],
  register: ({ lexical }) =>
    mergeRegister(
      registerHostSelection(lexical, $isPageBreakNode),
      registerSelectedAttribute(lexical, $isPageBreakNode),
      lexical.registerNodeTransform(PageBreakNode, $liftBlock),
    ),
  commands: {
    insertPageBreak: {
      run: () => {
        if (!$canInsertBlock()) return false;
        $caretAfter($insertBlockAtSelection($createPageBreakNode()));
      },
      can: $canInsertBlock,
    },
    removePageBreak: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getPageBreak(key);
        if (!node) return false;
        $removeBlockHost(node);
      },
      can: (_ctx, key?: NodeKey) => $getPageBreak(key) !== null,
    },
  },
  keymap: {
    pageBreak: { key: 'Mod-Enter', command: 'insertPageBreak', description: 'Page break' },
  },
  markdown: { pageBreak: PAGE_BREAK },
  icons: { pageBreak },
  messages: {
    'block.pageBreak': 'Page break',
    'block.pageBreak.description': 'Start a new page when printed',
  },
  items: [
    {
      id: 'pageBreak',
      label: 'block.pageBreak',
      description: 'block.pageBreak.description',
      icon: 'pageBreak',
      in: ['slash', 'insert'],
      group: 'basic',
      order: 45,
      keywords: ['page', 'break', 'print', 'new page', 'pagebreak'],
      shortcut: 'pageBreak',
      command: 'insertPageBreak',
    },
  ],
});
