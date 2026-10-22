'use client';

import { $getSelection, $isElementNode, $isRangeSelection } from 'lexical';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import type { AiAction, AiOptions, AiStorage } from '../../extensions/ai/index.js';
import { useOptionalEditor } from '../context.js';
import { selectionAnchor } from '../selection-anchor.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import type { FloatingAnchor } from '../ui/floating.js';
import { Icon } from '../ui/icon.js';
import { keepFocus } from '../ui/pointer.js';
import { Popover } from '../ui/popover.js';
import { useSignal } from '../use-signal.js';
import { useUiRequest } from '../use-ui-request.js';

/** The extension by name: the menu never imports it, so it stays out of a bundle without it. */
const AI = '@teispace/teieditor/ai';

/** The CSS highlight that marks the text an answer will replace. */
const TARGET_HIGHLIGHT = 'tei-ai-target';

export interface AiMenuProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
}

interface Opening {
  anchor: FloatingAnchor;
  /** The selected text when it opened, to keep it marked while focus is in the menu. */
  range: Range | null;
  id: number;
}

/** A copy of the page's selection in this editor, when it selects something. */
function selectedRange(editor: TeiEditor): Range | null {
  const root = editor.lexical.getRootElement();
  const selection = root?.ownerDocument.getSelection();
  if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
}

/**
 * The AI menu: a prompt and the actions, at the selection or the caret.
 * Type to filter the actions or to ask for anything; the answer streams in
 * below, and Accept (Enter) puts it in the document while Discard (Escape)
 * drops it. Opens for `openAiMenu` (⌘J, the slash menu's "Ask AI", the
 * bubble menu's "AI") and for a run started anywhere else.
 *
 * Render it once inside `<EditorContent>`. Needs the Ai extension with a `handler`.
 */
export function AiMenu({ editor: editorProp }: AiMenuProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <AiMenu> needs an `editor` prop or a provider');
  const storage = (editor.extension(AI)?.output as { storage?: AiStorage } | undefined)?.storage;
  const state = useSignal(storage?.state);
  const [opening, setOpening] = useState<Opening>();

  const open = useCallback(() => {
    // The page's selection; or, when focus is elsewhere, the block the editor's selection is in.
    const anchor =
      selectionAnchor(editor) ??
      editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return null;
        const node = selection.focus.getNode();
        const block = $isElementNode(node) ? node : node.getParent();
        return block ? editor.lexical.getElementByKey(block.getKey()) : null;
      }) ??
      editor.lexical.getRootElement();
    if (!anchor) return;
    const range = selectedRange(editor);
    setOpening((prev) => ({ anchor, range, id: (prev?.id ?? 0) + 1 }));
  }, [editor]);

  useUiRequest(storage?.menu, open);
  // A run started elsewhere (a button of the app's, code) shows here too.
  const shown = opening !== undefined;
  useEffect(() => {
    if (state && state !== 'idle' && !shown) open();
  }, [state, shown, open]);

  if (!storage) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('teieditor: <AiMenu> needs the Ai extension; it renders nothing.');
    }
    return null;
  }
  if (!opening) return null;
  return (
    <AiPanel
      // A new request starts a fresh menu.
      key={opening.id}
      editor={editor}
      storage={storage}
      opening={opening}
      onClose={() => setOpening(undefined)}
    />
  );
}

interface Row {
  id: string;
  label: string;
  icon?: string;
  /** A row that opens choices shows a chevron. */
  more?: boolean;
  run: () => void;
}

/** Text that changes at most once per `ms`: a live region read out without a flood. */
function useThrottled(value: string, ms: number): string {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    if (value === shown) return;
    const wait = Math.max(0, last.current + ms - Date.now());
    const timer = setTimeout(() => {
      last.current = Date.now();
      setShown(value);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, shown, ms]);
  return shown;
}

/** Mark the text an answer will replace, with the CSS Custom Highlight API: nothing in the document changes. */
function useTargetHighlight(range: Range | null, on: boolean): void {
  useEffect(() => {
    const css = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS;
    const Highlight = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const registry = css?.highlights;
    if (!range || !on || !registry || !Highlight) return;
    const highlight = new Highlight(range);
    registry.set(TARGET_HIGHLIGHT, highlight);
    return () => {
      if (registry.get(TARGET_HIGHLIGHT) === highlight) registry.delete(TARGET_HIGHLIGHT);
    };
  }, [range, on]);
}

function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || texts.some((text) => text?.toLowerCase().includes(q));
}

function AiPanel({
  editor,
  storage,
  opening,
  onClose,
}: {
  editor: TeiEditor;
  storage: AiStorage;
  opening: Opening;
  onClose: () => void;
}) {
  const state = useSignal(storage.state);
  const output = useSignal(storage.output);
  const error = useSignal(storage.error);
  const stopped = useSignal(storage.stopped);
  const mode = useSignal(storage.mode);
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState<AiAction | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const acceptButton = useRef<HTMLButtonElement>(null);
  const autoId = useId();
  const listId = `tei-ai-list${autoId.replace(/:/g, '')}`;
  const rowId = (index: number) => `${listId}-${index}`;

  // The actions that apply here, once: the selection stays put while the menu is open.
  const actions = useMemo(() => {
    const options = getPeerOptions<AiOptions>(editor.lexical, AI);
    return (options?.actions ?? []).filter((action) => editor.can().aiRun(action.id));
  }, [editor]);

  const close = (refocus = true) => {
    onClose();
    if (refocus) editor.focus();
  };
  const discard = () => {
    if (storage.state.peek() !== 'idle') editor.commands.aiDiscard();
    close();
  };
  const accept = () => {
    if (editor.commands.aiAccept()) {
      editor.announce(editor.t('ai.accepted'));
      close();
    }
  };

  // Back to nothing after an answer (accepted or dropped elsewhere): the menu goes.
  const answered = useRef(false);
  if (state !== 'idle') answered.current = true;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of state closes it
  useEffect(() => {
    if (state === 'idle' && answered.current) close(false);
  }, [state]);

  // Focus follows the answer: the panel while it streams, Accept once it is in.
  useEffect(() => {
    if (state === 'streaming') panel.current?.focus({ preventScroll: true });
    else if (state === 'done')
      (acceptButton.current ?? panel.current)?.focus({ preventScroll: true });
  }, [state]);

  useTargetHighlight(opening.range, state === 'idle' || mode === 'replace');

  const t = (id: string, values?: Record<string, string | number>) => editor.t(id, values);
  const rows: Row[] = useMemo(() => {
    if (choosing?.choices) {
      const { option, values } = choosing.choices;
      return [
        {
          id: 'back',
          label: editor.t('ai.back'),
          icon: 'chevronLeft',
          run: () => {
            setChoosing(null);
            setQuery('');
            setHighlighted(0);
          },
        },
        ...values
          .filter((choice) => matches(query, editor.t(choice.label ?? choice.value), choice.value))
          .map((choice) => ({
            id: `choice-${choice.value}`,
            label: editor.t(choice.label ?? choice.value),
            run: () => editor.commands.aiRun(choosing.id, { [option]: choice.value }),
          })),
      ];
    }
    const list: Row[] = actions
      .filter((action) =>
        matches(query, editor.t(action.label), action.id, ...(action.keywords ?? [])),
      )
      .map((action) => ({
        id: action.id,
        label: editor.t(action.label),
        icon: action.icon,
        more: Boolean(action.choices),
        run: action.choices
          ? () => {
              setChoosing(action);
              setQuery('');
              setHighlighted(1);
            }
          : () => editor.commands.aiRun(action.id),
      }));
    const prompt = query.trim();
    if (prompt && editor.can().aiPrompt(prompt)) {
      list.unshift({
        id: 'custom',
        label: editor.t('ai.custom', { prompt }),
        icon: 'sparkles',
        run: () => editor.commands.aiPrompt(prompt),
      });
    }
    return list;
  }, [actions, choosing, query, editor]);
  const current = Math.min(highlighted, rows.length - 1);

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const move = (to: number) => {
      event.preventDefault();
      if (rows.length) setHighlighted((to + rows.length) % rows.length);
    };
    if (event.key === 'ArrowDown') move(current + 1);
    else if (event.key === 'ArrowUp') move(current - 1);
    else if (event.key === 'Home' && !query) move(0);
    else if (event.key === 'End' && !query) move(rows.length - 1);
    else if (event.key === 'Enter') {
      event.preventDefault();
      rows[current]?.run();
    } else if (event.key === 'Backspace' && !query && choosing) {
      event.preventDefault();
      setChoosing(null);
      setHighlighted(0);
    }
  };

  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || state !== 'done') return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea')) return;
    event.preventDefault();
    accept();
  };

  const status =
    state === 'streaming'
      ? t('ai.writing')
      : state === 'done'
        ? output.trim()
          ? `${stopped ? `${t('ai.stopped')} ` : ''}${t('ai.ready')}`
          : t('ai.empty')
        : state === 'error'
          ? t('ai.failed', { error: error ?? '' })
          : '';
  const announced = useThrottled(status, 1000);
  const idle = state === 'idle';

  return (
    <Popover
      ref={panel}
      open
      anchor={opening.anchor}
      placement="bottom-start"
      offset={8}
      initialFocus="first"
      restoreFocus={false}
      // A press outside drops an unasked menu, never an answer.
      dismissOnOutside={idle}
      onDismiss={(reason) => (reason === 'escape' ? discard() : idle && close(false))}
      onKeyDown={onPanelKey}
      tabIndex={-1}
      role="dialog"
      aria-label={t('ai.menu')}
      className="tei-ai"
      data-tei-control="ai-menu"
      data-state={state}
    >
      {idle ? (
        <>
          <div className="tei-ai-prompt">
            <Icon icon="sparkles" />
            <Input
              value={query}
              placeholder={t('ai.placeholder')}
              aria-label={t('ai.placeholder')}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={current >= 0 ? rowId(current) : undefined}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="send"
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={onInputKey}
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label={choosing ? t(choosing.label) : t('ai.actions')}
            className="tei-menu tei-ai-list"
          >
            {rows.length === 0 && <div className="tei-menu-empty">{t('ai.noMatch')}</div>}
            {rows.map((row, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled once, in the field, through aria-activedescendant
              <div
                key={row.id}
                id={rowId(i)}
                role="option"
                aria-selected={i === current}
                className="tei-menu-item"
                data-highlighted={i === current ? '' : undefined}
                data-id={row.id}
                onPointerMove={(event) => {
                  if (event.pointerType !== 'touch' && i !== current) setHighlighted(i);
                }}
                onPointerDown={keepFocus}
                onClick={() => row.run()}
              >
                {row.icon && <Icon icon={row.icon} />}
                <span className="tei-menu-item-text">
                  <span className="tei-menu-item-label">{row.label}</span>
                </span>
                {row.more && <Icon icon="chevronRight" flipRtl />}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="tei-ai-answer">
          {/* The answer as text, never markup: it is shown as it arrives and only parsed on accept. */}
          <div
            className="tei-ai-preview"
            role="region"
            aria-label={t('ai.preview')}
            aria-busy={state === 'streaming'}
            data-mode={mode ?? undefined}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a long answer scrolls, by keyboard too
            tabIndex={0}
          >
            {output}
            {state === 'streaming' && <span className="tei-ai-cursor" aria-hidden="true" />}
          </div>
          {(state === 'error' || (state === 'done' && !output.trim())) && (
            <p className="tei-ai-status" data-error={state === 'error' ? '' : undefined}>
              {status}
            </p>
          )}
          <div className="tei-ai-buttons">
            {state === 'streaming' ? (
              <Button icon="stop" size="sm" onClick={() => editor.commands.aiStop()}>
                {t('ai.stop')}
              </Button>
            ) : (
              <>
                {state === 'done' && output.trim() !== '' && (
                  <Button
                    ref={acceptButton}
                    icon="check"
                    size="sm"
                    variant="solid"
                    onClick={accept}
                  >
                    {t('ai.accept')}
                  </Button>
                )}
                <Button icon="close" size="sm" onClick={discard}>
                  {t('ai.discard')}
                </Button>
                <Button icon="retry" size="sm" onClick={() => editor.commands.aiRetry()}>
                  {t('ai.retry')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="tei-sr-only" role="status" aria-live="polite">
        {announced}
      </div>
    </Popover>
  );
}
