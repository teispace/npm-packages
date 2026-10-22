import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import {
  $create,
  $createParagraphNode,
  $getDocument,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  KEY_BACKSPACE_COMMAND,
  type LexicalNode,
  type LexicalUpdateJSON,
  mergeRegister,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { $findSlotHost, registerStepOut } from '../../core/slot-host.js';
import { card as cardIcon, trash } from '../../icons/index.js';
import { commentFence } from '../../utils/comment-fence.js';
import { $blockOf, $selectedBlocks } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    setCard: [variant?: CardVariant];
    toggleCard: [variant?: CardVariant];
    setCardVariant: [variant: CardVariant, key?: NodeKey];
    setCardAccent: [accent: CardAccent | null, key?: NodeKey];
    unsetCard: [key?: NodeKey];
  }
  interface TeiActiveStates {
    card: [];
    cardVariant: [variant: CardVariant];
    cardAccent: [accent: CardAccent | null];
  }
}

/** How a card is drawn: raised on a shadow, a line round it, or a tinted panel. */
export const CARD_VARIANTS = ['default', 'outlined', 'filled'] as const;
export type CardVariant = (typeof CARD_VARIANTS)[number];

/** Accent colours, each a design token (`--tei-card-blue`), never a CSS value from the document. */
export const CARD_ACCENTS = ['gray', 'blue', 'green', 'yellow', 'red', 'purple'] as const;
export type CardAccent = (typeof CARD_ACCENTS)[number];

export const isCardVariant = (value: unknown): value is CardVariant =>
  (CARD_VARIANTS as readonly unknown[]).includes(value);
export const isCardAccent = (value: unknown): value is CardAccent =>
  (CARD_ACCENTS as readonly unknown[]).includes(value);

export interface SerializedCardNode extends SerializedElementNode {
  variant: CardVariant;
  accent: CardAccent | null;
}

/**
 * A raised box around any blocks, as a page builder's card: a heading, a
 * few lines, a list, an image. Saved as `<div data-tei-card="outlined">`;
 * its variant and accent are only ever the fixed names above, so neither
 * a file nor a paste puts its own value in a class or a style.
 */
export class CardNode extends ElementNode {
  __variant: CardVariant = 'default';
  __accent: CardAccent | null = null;

  $config() {
    return this.config('card', { extends: ElementNode });
  }

  afterCloneFrom(prev: this): void {
    super.afterCloneFrom(prev);
    this.__variant = prev.__variant;
    this.__accent = prev.__accent;
  }

  getVariant(): CardVariant {
    return this.getLatest().__variant;
  }

  /** An unknown name is the default. */
  setVariant(variant: unknown): this {
    const self = this.getWritable();
    self.__variant = isCardVariant(variant) ? variant : 'default';
    return self;
  }

  getAccent(): CardAccent | null {
    return this.getLatest().__accent;
  }

  /** An unknown name is none. */
  setAccent(accent: unknown): this {
    const self = this.getWritable();
    self.__accent = isCardAccent(accent) ? accent : null;
    return self;
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedCardNode>): this {
    const { variant, accent } = json as Partial<SerializedCardNode>;
    return super.updateFromJSON(json).setVariant(variant).setAccent(accent);
  }

  exportJSON(): SerializedCardNode {
    return { ...super.exportJSON(), variant: this.getVariant(), accent: this.getAccent() };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const box = $getDocument().createElement('div');
    box.className = (config.theme.card as string | undefined) ?? 'tei-card';
    paint(box, this.__variant, this.__accent);
    return box;
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__variant !== this.__variant || prev.__accent !== this.__accent) {
      paint(dom, this.__variant, this.__accent);
    }
    return false;
  }

  exportDOM(): DOMExportOutput {
    const box = $getDocument().createElement('div');
    box.setAttribute('data-tei-card', this.getVariant());
    const accent = this.getAccent();
    if (accent) box.setAttribute('data-tei-card-accent', accent);
    return { element: box };
  }

  /** It holds blocks, as the document does. */
  isShadowRoot(): boolean {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  canIndent(): false {
    return false;
  }
}

function paint(box: HTMLElement, variant: CardVariant, accent: CardAccent | null): void {
  box.setAttribute('data-variant', variant);
  if (accent) box.setAttribute('data-accent', accent);
  else box.removeAttribute('data-accent');
}

export function $createCardNode(variant?: CardVariant, accent?: CardAccent | null): CardNode {
  return $create(CardNode).setVariant(variant).setAccent(accent);
}

export function $isCardNode(node: LexicalNode | null | undefined): node is CardNode {
  return node instanceof CardNode;
}

// -- HTML and markdown --------------------------------------------------------

const CARD_RULE = defineImportRule({
  name: '@teispace/teieditor/card',
  match: sel.tag('div'),
  $import: (ctx, el, $next) => {
    if (!el.hasAttribute('data-tei-card')) return $next();
    const node = $createCardNode(
      el.getAttribute('data-tei-card')?.toLowerCase() as CardVariant,
      el.getAttribute('data-tei-card-accent')?.toLowerCase() as CardAccent,
    );
    const children = ctx.$importChildren(el);
    return [node.splice(0, 0, children.length > 0 ? children : [$createParagraphNode()])];
  },
});

/** `<!-- card outlined blue -->` … `<!-- /card -->`; the default variant is left unsaid. */
export const CARD = commentFence({
  name: 'card',
  dependencies: [CardNode],
  is: $isCardNode,
  words: (node) => {
    const variant = node.getVariant();
    const accent = node.getAccent();
    return [...(variant === 'default' ? [] : [variant]), ...(accent ? [accent] : [])];
  },
  create: (words) => $createCardNode(words.find(isCardVariant), words.find(isCardAccent)),
});

// -- Commands -----------------------------------------------------------------

/** The card meant: the one keyed, or the innermost the selection is in. */
function $getCard(key?: NodeKey): CardNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isCardNode(node) ? node : null;
  }
  const at = $getSelection()?.getNodes()[0];
  return at ? $findSlotHost(at, $isCardNode) : null;
}

function $unwrap(card: CardNode): void {
  for (const child of card.getChildren()) card.insertBefore(child);
  card.remove();
}

/** The selected blocks, those beside the first, in a new card. */
function $wrap(variant: CardVariant | undefined): boolean {
  const blocks = $selectedBlocks();
  const first = blocks[0];
  if (!first) return false;
  const parent = first.getParent();
  const card = $createCardNode(variant);
  first.insertBefore(card);
  card.append(...blocks.filter((block) => parent?.is(block.getParent())));
  return true;
}

/** Backspace at the start of a card's first line takes the card away, keeping its blocks. */
function $backspace(event: KeyboardEvent | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.offset !== 0)
    return false;
  const block = $blockOf(selection.anchor.getNode());
  const card = block?.getParent();
  if (!$isParagraphNode(block) || !$isCardNode(card) || block.getPreviousSibling()) return false;
  const anchor = selection.anchor.getNode();
  if (!anchor.is(block) && !anchor.is(block.getFirstDescendant())) return false;
  event?.preventDefault();
  $unwrap(card);
  return true;
}

const known = (variant: unknown) => variant === undefined || isCardVariant(variant);

/**
 * Cards: blocks set in a raised, outlined or filled box, with an accent
 * colour from the theme. The slash menu and the block handle's turn
 * blocks into one; the context menu changes its look.
 */
export const Card = defineTeiExtension({
  name: '@teispace/teieditor/card',
  nodes: [CardNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [CARD_RULE] })],
  markdown: { card: CARD },
  register: ({ lexical }) =>
    mergeRegister(
      // Never empty, and blocks only: a stray inline goes in a line.
      lexical.registerNodeTransform(CardNode, (node) => {
        if (node.isEmpty()) node.append($createParagraphNode());
        for (const child of node.getChildren()) {
          if (!$isElementNode(child) && child.isInline()) {
            child.replace($createParagraphNode()).append(child);
          }
        }
      }),
      lexical.registerCommand(KEY_BACKSPACE_COMMAND, $backspace, COMMAND_PRIORITY_LOW),
      registerStepOut(lexical, $isCardNode),
    ),
  commands: {
    setCard: {
      run: (_ctx, variant?: CardVariant) => {
        if (!known(variant)) return false;
        const current = $getCard();
        if (current) {
          if (variant) current.setVariant(variant);
          return;
        }
        if (!$wrap(variant)) return false;
      },
      can: (_ctx, variant?: CardVariant) =>
        known(variant) && ($getCard() !== null || $selectedBlocks().length > 0),
    },
    toggleCard: {
      run: (_ctx, variant?: CardVariant) => {
        if (!known(variant)) return false;
        const current = $getCard();
        if (current) {
          if (variant && current.getVariant() !== variant) current.setVariant(variant);
          else $unwrap(current);
          return;
        }
        if (!$wrap(variant)) return false;
      },
      can: (_ctx, variant?: CardVariant) =>
        known(variant) && ($getCard() !== null || $selectedBlocks().length > 0),
    },
    setCardVariant: {
      run: (_ctx, variant: CardVariant, key?: NodeKey) => {
        const node = $getCard(key);
        if (!node || !isCardVariant(variant)) return false;
        node.setVariant(variant);
      },
      can: (_ctx, variant?: CardVariant, key?: NodeKey) =>
        $getCard(key) !== null && (variant === undefined || isCardVariant(variant)),
    },
    setCardAccent: {
      run: (_ctx, accent: CardAccent | null, key?: NodeKey) => {
        const node = $getCard(key);
        if (!node || (accent !== null && !isCardAccent(accent))) return false;
        node.setAccent(accent);
      },
      can: (_ctx, accent?: CardAccent | null, key?: NodeKey) =>
        $getCard(key) !== null && (accent == null || isCardAccent(accent)),
    },
    unsetCard: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getCard(key);
        if (!node) return false;
        $unwrap(node);
      },
      can: (_ctx, key?: NodeKey) => $getCard(key) !== null,
    },
  },
  active: {
    card: () => $getCard() !== null,
    cardVariant: (_ctx, variant: CardVariant) => $getCard()?.getVariant() === variant,
    cardAccent: (_ctx, accent: CardAccent | null) => {
      const card = $getCard();
      return card !== null && card.getAccent() === accent;
    },
  },
  icons: { card: cardIcon, trash },
  messages: {
    'block.card': 'Card',
    'block.card.description': 'Set blocks in a raised box',
    'card.menu': 'Card',
    'card.default': 'Raised',
    'card.outlined': 'Outlined',
    'card.filled': 'Filled',
    'card.accent.none': 'No accent',
    'card.accent.gray': 'Gray accent',
    'card.accent.blue': 'Blue accent',
    'card.accent.green': 'Green accent',
    'card.accent.yellow': 'Yellow accent',
    'card.accent.red': 'Red accent',
    'card.accent.purple': 'Purple accent',
    'card.remove': 'Remove card',
  },
  items: [
    {
      id: 'card',
      label: 'block.card',
      description: 'block.card.description',
      icon: 'card',
      in: ['slash', 'blockMenu'],
      group: 'basic',
      order: 24,
      keywords: ['card', 'box', 'panel', 'container', 'frame', 'tile'],
      command: 'setCard',
      active: 'card',
    },
    ...CARD_VARIANTS.map((variant, i) => ({
      id: `card-${variant}`,
      label: `card.${variant}`,
      in: ['cardMenu'] as const,
      group: 'card',
      order: i,
      command: 'setCardVariant' as const,
      args: [variant],
      active: 'cardVariant' as const,
      activeArgs: [variant],
    })),
    ...[null, ...CARD_ACCENTS].map((accent, i) => ({
      id: `card-accent-${accent ?? 'none'}`,
      label: `card.accent.${accent ?? 'none'}`,
      in: ['cardMenu'] as const,
      group: 'cardAccent',
      order: i,
      command: 'setCardAccent' as const,
      args: [accent],
      active: 'cardAccent' as const,
      activeArgs: [accent],
    })),
    {
      id: 'unsetCard',
      label: 'card.remove',
      icon: 'trash',
      in: ['cardMenu'],
      group: 'cardRemove',
      command: 'unsetCard',
    },
  ],
});
