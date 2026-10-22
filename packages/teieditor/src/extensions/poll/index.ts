import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import type { ElementTransformer } from '@lexical/markdown';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $onUpdate,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import {
  $canInsertBlock,
  $insertBlockAtSelection,
  $liftBlock,
  $removeBlockHost,
  registerHostSelection,
  registerSelectedAttribute,
} from '../../core/slot-host.js';
import { check, close, plus, poll as pollIcon } from '../../icons/index.js';
import { RichText } from '../rich-text/index.js';
import {
  $createPollNode,
  $isPollNode,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  PollNode,
  parseVoters,
  repaintPolls,
  setPollVoter,
} from './node.js';

export type { PollOption, SerializedPollNode } from './node.js';
export {
  $createPollNode,
  $isPollNode,
  cleanOptions,
  cleanVoters,
  POLL_MAX_OPTIONS,
  POLL_MAX_TEXT,
  POLL_MIN_OPTIONS,
  PollNode,
  parseVoters,
  pollVoter,
} from './node.js';

export interface PollOptions {
  /**
   * Who is voting: your user's id. Default: a random id made once per
   * editor, which suits a single person's document or a demo.
   */
  voter: (() => string) | null;
  /** Whether one voter can choose several answers. Default false: a vote moves. */
  multiple: boolean;
}

export interface PollStorage {
  /** The id voted as when the `voter` option is not set. */
  readonly voter: string;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** A poll where the caret is: a question and its answers (two empty ones by default). */
    insertPoll: [question?: string, options?: readonly string[]];
    setPollQuestion: [question: string, key?: NodeKey];
    setPollOption: [index: number, text: string, key?: NodeKey];
    /** Another answer at the end, up to ten. */
    addPollOption: [text?: string, key?: NodeKey];
    /** Take an answer and its votes away, down to two. */
    removePollOption: [index: number, key?: NodeKey];
    /** Vote for an answer as the current voter, or take the vote back. */
    togglePollVote: [index: number, key?: NodeKey];
    removePoll: [key?: NodeKey];
  }
  interface TeiActiveStates {
    /** A poll is selected. */
    poll: [];
  }
}

/** The extension's name. */
export const POLL_EXTENSION = '@teispace/teieditor/poll';

/** The poll with this key, else the selected one. */
export function $getPoll(key?: NodeKey): PollNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isPollNode(node) ? node : null;
  }
  const selection = $getSelection();
  const nodes = $isNodeSelection(selection) ? selection.getNodes() : [];
  return nodes.length === 1 && $isPollNode(nodes[0]) ? nodes[0] : null;
}

const validIndex = (poll: PollNode | null, index: unknown): poll is PollNode =>
  poll !== null &&
  typeof index === 'number' &&
  Number.isInteger(index) &&
  index >= 0 &&
  index < poll.getOptions().length;

function randomId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.every((b) => b === 0))
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.random() * 256;
  return `anon-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// -- HTML and Markdown --------------------------------------------------------

/** `<div data-tei-poll>`, as a poll saves: its question, answers and each answer's voters. */
const POLL_RULE = defineImportRule({
  name: POLL_EXTENSION,
  match: sel.tag('div'),
  $import: (_ctx, el, $next) => {
    if (!el.hasAttribute('data-tei-poll')) return $next();
    const options = Array.from(el.querySelectorAll('[data-tei-poll-option]'), (item) => ({
      text: (item.querySelector('[data-tei-poll-label]') ?? item).textContent?.trim() ?? '',
      voters: parseVoters(item.getAttribute('data-voters')),
    }));
    const question = el.querySelector('[data-tei-poll-question]')?.textContent?.trim() ?? '';
    return [$createPollNode(question, options)];
  },
});

/**
 * Out as text a reader can follow, `**Poll:** question` and a line per
 * answer with its votes. Markdown has no polls: it reads back as that text,
 * without the votes' owners.
 */
export const POLL: ElementTransformer = {
  dependencies: [PollNode],
  export: (node) => {
    if (!$isPollNode(node)) return null;
    const escape = (s: string) => s.replace(/[\\*_[\]`]/g, '\\$&').replace(/\n/g, ' ');
    return [
      `**Poll:** ${escape(node.getQuestion())}`.trimEnd(),
      '',
      ...node.getOptions().map((o) => `- ${escape(o.text)} (${o.voters.length})`),
    ].join('\n');
  },
  regExp: /(?!)/,
  replace: () => false,
  type: 'element',
};

// -- Extension ----------------------------------------------------------------

/**
 * Polls: a question and two to ten answers, each with a vote toggle, a
 * count and a bar. Edited in place as a small form; read-only, the
 * results. Votes are kept by voter id (the `voter` option), so a shared
 * document counts each person once. Saved as `<div data-tei-poll>`.
 */
export const Poll = defineTeiExtension({
  name: POLL_EXTENSION,
  config: { voter: null, multiple: false } as PollOptions,
  nodes: [PollNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [POLL_RULE] })],
  storage: (): PollStorage => ({ voter: randomId() }),
  markdown: { poll: POLL },
  register: ({ lexical, options, storage }) =>
    mergeRegister(
      setPollVoter(lexical, () => options.voter?.() || storage.voter),
      registerHostSelection(lexical, $isPollNode),
      registerSelectedAttribute(lexical, $isPollNode),
      lexical.registerNodeTransform(PollNode, $liftBlock),
      lexical.registerEditableListener(() => repaintPolls(lexical)),
    ),
  commands: {
    insertPoll: {
      run: ({ lexical }, question?: string, answers?: readonly string[]) => {
        if (!$canInsertBlock()) return false;
        const node = $insertBlockAtSelection(
          $createPollNode(typeof question === 'string' ? question : '', answers ?? []),
        );
        if (!node.getNextSibling()) node.insertAfter($createParagraphNode());
        // From the UI: straight on to typing the question.
        const key = node.getKey();
        const root = lexical.getRootElement();
        if (root?.contains(root.ownerDocument.activeElement)) {
          $onUpdate(() => {
            lexical.getElementByKey(key)?.querySelector('input')?.focus();
          });
        }
      },
      can: $canInsertBlock,
    },
    setPollQuestion: {
      run: (_ctx, question: string, key?: NodeKey) => {
        const node = $getPoll(key);
        if (!node || typeof question !== 'string') return false;
        if (node.getQuestion() !== question) node.setQuestion(question);
      },
      can: (_ctx, _question?: string, key?: NodeKey) => $getPoll(key) !== null,
    },
    setPollOption: {
      run: (_ctx, index: number, text: string, key?: NodeKey) => {
        const node = $getPoll(key);
        if (!validIndex(node, index) || typeof text !== 'string') return false;
        if (node.getOptions()[index]?.text !== text) node.setOptionText(index, text);
      },
      can: (_ctx, index?: number, _text?: string, key?: NodeKey) =>
        index === undefined ? $getPoll(key) !== null : validIndex($getPoll(key), index),
    },
    addPollOption: {
      run: (_ctx, text?: string, key?: NodeKey) => {
        const node = $getPoll(key);
        if (!node || node.getOptions().length >= POLL_MAX_OPTIONS) return false;
        node.addOption(typeof text === 'string' ? text : '');
      },
      can: (_ctx, _text?: string, key?: NodeKey) =>
        ($getPoll(key)?.getOptions().length ?? POLL_MAX_OPTIONS) < POLL_MAX_OPTIONS,
    },
    removePollOption: {
      run: (_ctx, index: number, key?: NodeKey) => {
        const node = $getPoll(key);
        if (!validIndex(node, index) || node.getOptions().length <= POLL_MIN_OPTIONS) return false;
        node.removeOption(index);
      },
      can: (_ctx, index?: number, key?: NodeKey) => {
        const node = $getPoll(key);
        return (
          (node?.getOptions().length ?? 0) > POLL_MIN_OPTIONS &&
          (index === undefined || validIndex(node, index))
        );
      },
    },
    togglePollVote: {
      run: ({ options, storage }, index: number, key?: NodeKey) => {
        const node = $getPoll(key);
        const voter = options.voter?.() || storage.voter;
        if (!validIndex(node, index) || !voter) return false;
        node.toggleVote(index, voter, options.multiple);
      },
      can: (_ctx, index?: number, key?: NodeKey) =>
        index === undefined ? $getPoll(key) !== null : validIndex($getPoll(key), index),
    },
    removePoll: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getPoll(key);
        if (!node) return false;
        $removeBlockHost(node);
      },
      can: (_ctx, key?: NodeKey) => $getPoll(key) !== null,
    },
  },
  active: { poll: () => $getPoll() !== null },
  icons: { poll: pollIcon, check, close, plus },
  messages: {
    'poll.insert': 'Poll',
    'poll.insert.description': 'Ask a question with answers to vote on',
    'poll.label': 'Poll',
    'poll.question': 'Ask a question',
    'poll.option': 'Option {n}',
    'poll.vote': 'Vote for {option}',
    'poll.removeOption': 'Remove {option}',
    'poll.addOption': 'Add option',
    'poll.votes.one': '{count} vote',
    'poll.votes.other': '{count} votes',
    'poll.result': '{option}: {votes}',
  },
  items: [
    {
      id: 'insertPoll',
      label: 'poll.insert',
      description: 'poll.insert.description',
      icon: 'poll',
      in: ['slash', 'insert'],
      group: 'insert',
      order: 60,
      keywords: ['poll', 'vote', 'survey', 'question', 'choice'],
      command: 'insertPoll',
    },
  ],
});
