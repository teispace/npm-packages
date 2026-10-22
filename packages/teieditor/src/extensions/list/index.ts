import {
  $insertList,
  $isListItemNode,
  $isListNode,
  $removeList,
  CheckListExtension,
  ListExtension,
  ListNode,
  type ListType,
} from '@lexical/list';
import { CHECK_LIST, ORDERED_LIST, UNORDERED_LIST } from '@lexical/markdown';
import { $findMatchingParent } from '@lexical/utils';
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  configExtension,
  INDENT_CONTENT_COMMAND,
  type LexicalNode,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import { bulletList, checkList, orderedList } from '../../icons/index.js';
import { $selectedBlocks } from '../../utils/selection.js';
import { RichText } from '../rich-text/index.js';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    toggleBulletList: [];
    toggleOrderedList: [];
    toggleCheckList: [];
    /** Indent the selected list items one level (Tab). */
    sinkListItem: [];
    /** Outdent the selected list items one level (Shift-Tab). */
    liftListItem: [];
  }
  interface TeiActiveStates {
    bulletList: [];
    orderedList: [];
    checkList: [];
    /** The selection is inside any list. */
    list: [];
  }
}

/** The type of the innermost list at the selection, if every selected block is a list. */
function $listTypeAtSelection(): ListType | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const blocks = $selectedBlocks(selection);
  if (blocks.length === 0 || !blocks.every($isListNode)) return null;
  const anchor = selection.anchor.getNode();
  const list = $findMatchingParent(anchor, (n: LexicalNode) => $isListNode(n));
  return $isListNode(list) ? list.getListType() : null;
}

const $toggleList = (type: ListType) => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  if ($listTypeAtSelection() === type) $removeList();
  else $insertList(type);
};

function $selectedListItems() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];
  const items = new Map<string, ReturnType<typeof $findMatchingParent>>();
  for (const node of selection.getNodes()) {
    const item = $findMatchingParent(node, $isListItemNode);
    if (item) items.set(item.getKey(), item);
  }
  return [...items.values()].filter($isListItemNode);
}

export interface ListOptions {
  /** Keep a numbered list's numbering when it is split. Default false. */
  shouldPreserveNumbering: boolean;
  /** Indent at most one level deeper than the item above. Default false. */
  hasStrictIndent: boolean;
}

/** List items indent and outdent: Tab and Shift-Tab inside lists. */
const ListKeymap = defineTeiExtension({
  name: '@teispace/teieditor/list-keymap',
  dependencies: [ListExtension],
  commands: {
    // List items nest themselves when indented (ListItemNode.setIndent).
    sinkListItem: {
      run: ({ lexical }) =>
        $selectedListItems().length > 0 &&
        lexical.dispatchCommand(INDENT_CONTENT_COMMAND, undefined),
      can: () => $selectedListItems().length > 0,
    },
    liftListItem: {
      run: ({ lexical }) =>
        $selectedListItems().length > 0 &&
        lexical.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined),
      can: () => $selectedListItems().length > 0,
    },
  },
  active: { list: () => $listTypeAtSelection() !== null },
  keymap: {
    sinkListItem: { key: 'Tab', command: 'sinkListItem', description: 'Indent list item' },
    liftListItem: { key: 'Shift-Tab', command: 'liftListItem', description: 'Outdent list item' },
  },
});

/** Bulleted lists. Markdown `- `, `* `, `+ `; ⌘⇧8. */
export const BulletList = defineTeiExtension({
  name: '@teispace/teieditor/bullet-list',
  dependencies: [RichText, ListExtension, ListKeymap],
  commands: {
    toggleBulletList: {
      run: () => $toggleList('bullet'),
      can: () => $isRangeSelection($getSelection()),
    },
  },
  active: { bulletList: () => $listTypeAtSelection() === 'bullet' },
  keymap: {
    bulletList: { key: 'Mod-Shift-8', command: 'toggleBulletList', description: 'Bulleted list' },
  },
  markdown: { unorderedList: UNORDERED_LIST },
  icons: { bulletList },
  messages: {
    'block.bulletList': 'Bulleted list',
    'block.bulletList.description': 'A simple list',
  },
  items: [
    {
      id: 'bulletList',
      label: 'block.bulletList',
      description: 'block.bulletList.description',
      icon: 'bulletList',
      in: ['toolbar', 'blockType', 'slash', 'blockMenu'],
      group: 'list',
      order: 0,
      keywords: ['bullet', 'unordered', 'ul', 'list', '-'],
      shortcut: 'bulletList',
      command: 'toggleBulletList',
      active: 'bulletList',
    },
  ],
});

/** Numbered lists. Markdown `1. `; ⌘⇧7. */
export const OrderedList = defineTeiExtension({
  name: '@teispace/teieditor/ordered-list',
  dependencies: [RichText, ListExtension, ListKeymap],
  commands: {
    toggleOrderedList: {
      run: () => $toggleList('number'),
      can: () => $isRangeSelection($getSelection()),
    },
  },
  active: { orderedList: () => $listTypeAtSelection() === 'number' },
  keymap: {
    orderedList: { key: 'Mod-Shift-7', command: 'toggleOrderedList', description: 'Numbered list' },
  },
  markdown: { orderedList: ORDERED_LIST },
  icons: { orderedList },
  messages: {
    'block.orderedList': 'Numbered list',
    'block.orderedList.description': 'A list with numbering',
  },
  items: [
    {
      id: 'orderedList',
      label: 'block.orderedList',
      description: 'block.orderedList.description',
      icon: 'orderedList',
      in: ['toolbar', 'blockType', 'slash', 'blockMenu'],
      group: 'list',
      order: 1,
      keywords: ['numbered', 'ordered', 'ol', 'list', '1.'],
      shortcut: 'orderedList',
      command: 'toggleOrderedList',
      active: 'orderedList',
    },
  ],
});

/** To-do lists with checkboxes. Markdown `[ ] ` / `[x] `; ⌘⇧9. */
export const CheckList = defineTeiExtension({
  name: '@teispace/teieditor/check-list',
  dependencies: [RichText, CheckListExtension, ListKeymap],
  commands: {
    toggleCheckList: {
      run: () => $toggleList('check'),
      can: () => $isRangeSelection($getSelection()),
    },
  },
  active: { checkList: () => $listTypeAtSelection() === 'check' },
  // Lexical makes each to-do item a checkbox, so a to-do list is a group of
  // checkboxes: as a list, its items would not be list items.
  register: ({ lexical }) =>
    lexical.registerMutationListener(ListNode, (mutations) => {
      lexical.getEditorState().read(() => {
        for (const [key, kind] of mutations) {
          const node = kind === 'destroyed' ? null : $getNodeByKey(key);
          const dom = lexical.getElementByKey(key);
          if (!$isListNode(node) || !dom) continue;
          if (node.getListType() === 'check') dom.setAttribute('role', 'group');
          else if (dom.getAttribute('role') === 'group') dom.removeAttribute('role');
        }
      });
    }),
  keymap: {
    checkList: { key: 'Mod-Shift-9', command: 'toggleCheckList', description: 'To-do list' },
  },
  markdown: { checkList: CHECK_LIST },
  icons: { checkList },
  messages: { 'block.checkList': 'To-do list', 'block.checkList.description': 'Track tasks' },
  items: [
    {
      id: 'checkList',
      label: 'block.checkList',
      description: 'block.checkList.description',
      icon: 'checkList',
      in: ['toolbar', 'blockType', 'slash', 'blockMenu'],
      group: 'list',
      order: 2,
      keywords: ['todo', 'task', 'checkbox', 'check', '[]'],
      shortcut: 'checkList',
      command: 'toggleCheckList',
      active: 'checkList',
    },
  ],
});

/** Lexical's list options, for the bullet and numbered lists both: `configureLists({...})`. */
export const configureLists = (options: Partial<ListOptions>) =>
  configExtension(ListExtension, options);

/** All three list kinds, as a preset. */
export const Lists = [BulletList, OrderedList, CheckList] as const;
