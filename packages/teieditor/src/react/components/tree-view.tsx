'use client';

import type { LexicalCommandLog } from '@lexical/devtools-core';
import type { Signal } from '@lexical/extension';
import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type {
  TreeViewMode,
  TreeViewOptions,
  TreeViewStorage,
} from '../../extensions/tree-view/index.js';
import { indentHTML } from '../../utils/indent-html.js';
import { frameScheduler } from '../../utils/overlay.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { Button } from '../ui/button.js';
import { cx } from '../ui/context.js';
import { useSignal } from '../use-signal.js';

const NAME = '@teispace/teieditor/tree-view';
const MODES: readonly TreeViewMode[] = ['tree', 'json', 'html'];
/** Longest wait between two updates when playing them back, in ms. */
const MAX_STEP = 1_000;
/** How long "Copied" shows, in ms. */
const COPIED_FOR = 1_500;

export interface TreeViewPanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'children'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** The view it opens on. Default the node tree. */
  defaultMode?: TreeViewMode;
}

/** Lexical's devtools, loaded once, the first time a panel draws a tree. */
let devtools: Promise<typeof import('@lexical/devtools-core')> | undefined;
const loadDevtools = () => {
  devtools ??= import('@lexical/devtools-core');
  return devtools;
};

/**
 * The node tree panel (the TreeView extension): the live Lexical tree with
 * the selection and the last commands, or the document as JSON or as the
 * HTML it saves, with a copy button; and time travel through every
 * recorded update, played back or stepped through, the editor read-only
 * meanwhile. Shows while the extension's `open` option is on.
 *
 * Render it once, beside `<EditorContent>` (`<Editor>` puts it under the document).
 */
export function TreeViewPanel({ editor: editorProp, ...props }: TreeViewPanelProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <TreeViewPanel> needs an `editor` prop or a provider');
  const found = editor.extension(NAME)?.output as
    | {
        storage: TreeViewStorage;
        options: { [K in keyof TreeViewOptions]: Signal<TreeViewOptions[K]> };
      }
    | undefined;
  if (!found) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('teieditor: <TreeViewPanel> needs the TreeView extension; it renders nothing.');
    }
    return null;
  }
  return (
    <TeiEditorContext.Provider value={editor}>
      <Open editor={editor} storage={found.storage} options={found.options} {...props} />
    </TeiEditorContext.Provider>
  );
}

type Options = { [K in keyof TreeViewOptions]: Signal<TreeViewOptions[K]> };

function Open({
  options,
  ...rest
}: Omit<TreeViewPanelProps, 'editor'> & {
  editor: TeiEditor;
  storage: TreeViewStorage;
  options: Options;
}) {
  const open = useSignal(options.open);
  return open ? <Panel options={options} {...rest} /> : null;
}

function Panel({
  editor,
  storage,
  options,
  defaultMode = 'tree',
  className,
  ...props
}: Omit<TreeViewPanelProps, 'editor'> & {
  editor: TeiEditor;
  storage: TreeViewStorage;
  options: Options;
}) {
  const id = useId();
  const t = (key: string, values?: Record<string, string | number>) => editor.t(key, values);
  const [mode, setMode] = useState<TreeViewMode>(defaultMode);
  const content = useContent(editor, mode, options);
  const history = useSignal(storage.history);
  const travelling = useSignal(storage.travelling);
  const [playing, setPlaying] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  // Playing: each recorded update after the last, as far apart as they happened.
  useEffect(() => {
    if (!playing || travelling === null) return;
    const list = storage.history.peek();
    const now = list[travelling];
    const next = list[travelling + 1];
    if (!now || !next) {
      setPlaying(false);
      return;
    }
    const wait = Math.min(Math.max(next.time - now.time, 16), MAX_STEP);
    const timer = setTimeout(() => storage.travelTo(travelling + 1), wait);
    return () => clearTimeout(timer);
  }, [playing, travelling, storage]);
  useEffect(() => {
    if (travelling === null) setPlaying(false);
  }, [travelling]);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = MODES.indexOf(mode);
    const to =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % MODES.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index + MODES.length - 1) % MODES.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? MODES.length - 1
              : -1;
    if (to < 0) return;
    event.preventDefault();
    setMode(MODES[to] as TreeViewMode);
    tabs.current[to]?.focus();
  };

  const total = history.length;
  const at = travelling ?? total - 1;
  const entry = history[at];
  const position = t('treeView.position', { current: at + 1, total });

  return (
    <section
      {...props}
      className={cx('tei-tree-view', className)}
      data-tei-control="tree-view"
      data-travelling={travelling === null ? undefined : ''}
      aria-label={t('treeView.label')}
    >
      <div className="tei-tree-view-bar">
        <div className="tei-tree-view-tabs" role="tablist" aria-label={t('treeView.views')}>
          {MODES.map((each, index) => (
            <button
              key={each}
              ref={(el) => {
                tabs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-${each}`}
              className="tei-tree-view-tab"
              aria-selected={mode === each}
              aria-controls={`${id}-panel`}
              tabIndex={mode === each ? 0 : -1}
              onClick={() => setMode(each)}
              onKeyDown={onTabKey}
            >
              {t(`treeView.${each}`)}
            </button>
          ))}
        </div>
        <span className="tei-tree-view-tools">
          <CopyButton editor={editor} text={content.text} />
          <Button
            size="sm"
            icon="clock"
            label={t('treeView.timeTravel')}
            pressed={travelling !== null}
            disabled={travelling === null && total < 2}
            onClick={() => {
              if (travelling === null) storage.travelTo(total - 1);
              else storage.exitTimeTravel();
            }}
          />
          <Button
            size="sm"
            icon="close"
            label={t('treeView.close')}
            onClick={() => {
              storage.exitTimeTravel();
              editor.commands.toggleTreeView();
            }}
          />
        </span>
      </div>
      {travelling !== null && (
        <fieldset className="tei-tree-view-travel">
          <legend className="tei-sr-only">{t('treeView.timeTravel')}</legend>
          <Button
            size="sm"
            icon={playing ? 'pause' : 'play'}
            label={t(playing ? 'treeView.pause' : 'treeView.play')}
            disabled={total < 2}
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                // From the start when at the end.
                if (at >= total - 1) storage.travelTo(0);
                setPlaying(true);
              }
            }}
          />
          <Button
            size="sm"
            icon="chevronLeft"
            label={t('treeView.previous')}
            data-flip-rtl=""
            disabled={at <= 0}
            onClick={() => storage.travelTo(at - 1)}
          />
          <input
            type="range"
            className="tei-tree-view-slider"
            min={0}
            max={Math.max(0, total - 1)}
            step={1}
            value={at}
            aria-label={t('treeView.update')}
            aria-valuetext={entry ? `${position}, ${clock(entry.time)}` : position}
            onChange={(event) => {
              setPlaying(false);
              storage.travelTo(Number(event.currentTarget.value));
            }}
          />
          <Button
            size="sm"
            icon="chevronRight"
            label={t('treeView.next')}
            data-flip-rtl=""
            disabled={at >= total - 1}
            onClick={() => storage.travelTo(at + 1)}
          />
          <output className="tei-tree-view-position" aria-live="polite">
            {position}
          </output>
          <Button size="sm" variant="outline" onClick={() => storage.exitTimeTravel()}>
            {t('treeView.exit')}
          </Button>
        </fieldset>
      )}
      <div
        id={`${id}-panel`}
        className="tei-tree-view-panel"
        role="tabpanel"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the panel scrolls, and a keyboard scrolls what has focus
        tabIndex={0}
        aria-labelledby={`${id}-${mode}`}
      >
        {content.large !== null ? (
          <p className="tei-tree-view-note">
            {t('treeView.large', { count: content.large })}{' '}
            <Button size="sm" variant="outline" onClick={content.showAnyway}>
              {t('treeView.showAnyway')}
            </Button>
          </p>
        ) : (
          <pre className="tei-tree-view-output" aria-busy={content.loading || undefined}>
            {content.loading && !content.text ? t('treeView.loading') : content.text}
          </pre>
        )}
      </div>
    </section>
  );
}

/** A time of day to the millisecond, as the slider reads it out. */
const clock = (time: number) => {
  const date = new Date(time);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

/**
 * The text a view shows, drawn again after each update (once a frame at
 * most). The tree waits for its large-document check and for devtools to
 * load; the last commands run go under it.
 */
function useContent(editor: TeiEditor, mode: TreeViewMode, options: Options) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(mode === 'tree');
  const [large, setLarge] = useState<number | null>(null);
  const [forced, setForced] = useState(false);

  useEffect(() => {
    const lexical = editor.lexical;
    let alive = true;
    let log: LexicalCommandLog = [];
    let offLog = () => {};
    const draw = frameScheduler(() => {
      if (!alive) return;
      if (mode === 'json') {
        setText(JSON.stringify(editor.getJSON(), null, 2));
        return;
      }
      if (mode === 'html') {
        setText(indentHTML(editor.getHTML()));
        return;
      }
      const size = lexical.getEditorState()._nodeMap.size;
      if (!forced && size > options.largeTree.peek()) {
        setLarge(size);
        return;
      }
      setLarge(null);
      loadDevtools()
        .then(({ generateContent }) => {
          if (!alive) return;
          setText(generateContent(lexical, log, false));
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (!alive) return;
          setText(
            editor.t('treeView.error', { message: String((error as Error)?.message ?? error) }),
          );
          setLoading(false);
        });
    });
    setLoading(mode === 'tree');
    if (mode === 'tree') {
      loadDevtools()
        .then(({ registerLexicalCommandLogger }) => {
          if (!alive) return;
          offLog = registerLexicalCommandLogger(lexical, (update) => {
            log = update(log);
            draw.schedule();
          });
        })
        .catch(() => {});
    }
    draw.schedule();
    const offUpdate = lexical.registerUpdateListener(() => draw.schedule());
    const offEditable = lexical.registerEditableListener(() => draw.schedule());
    return () => {
      alive = false;
      draw.cancel();
      offUpdate();
      offEditable();
      offLog();
    };
  }, [editor, mode, forced, options]);

  return {
    text,
    loading,
    large: mode === 'tree' ? large : null,
    showAnyway: () => setForced(true),
  };
}

function CopyButton({ editor, text }: { editor: TeiEditor; text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = editor.t(copied ? 'treeView.copied' : 'treeView.copy');
  return (
    <>
      <Button
        size="sm"
        icon="copy"
        label={label}
        disabled={!text}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            return;
          }
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), COPIED_FOR);
        }}
      />
      <span className="tei-sr-only" role="status">
        {copied ? label : ''}
      </span>
    </>
  );
}
