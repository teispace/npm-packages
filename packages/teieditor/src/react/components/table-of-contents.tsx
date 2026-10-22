'use client';

import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from 'react';
import type { TeiEditor } from '../../core/editor.js';
import {
  getOutline,
  outlineTree,
  type TocEntry,
  type TocTreeEntry,
} from '../../extensions/table-of-contents/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { cx } from '../ui/context.js';
import { Icon } from '../ui/icon.js';

const NONE: readonly TocEntry[] = [];

/** The editor's live outline; `[]` without the extension. */
export function useOutline(editor: TeiEditor): readonly TocEntry[] {
  const signal = getOutline(editor);
  return useSyncExternalStore(
    (notify) => signal?.subscribe(notify) ?? (() => {}),
    () => signal?.peek() ?? NONE,
    () => signal?.peek() ?? NONE,
  );
}

/** Whether a media query matches, following it; `false` on the server. */
function useMedia(query: string | null): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = query && typeof matchMedia === 'function' ? matchMedia(query) : null;
      list?.addEventListener('change', notify);
      return () => list?.removeEventListener('change', notify);
    },
    () => Boolean(query && typeof matchMedia === 'function' && matchMedia(query).matches),
    () => false,
  );
}

/**
 * The heading in view: the last one above a line `offset` of the way down
 * the viewport (the first, before any is). Watched with an
 * IntersectionObserver, so scrolling costs nothing between headings.
 */
function useActiveHeading(
  editor: TeiEditor,
  entries: readonly TocEntry[],
  offset: number,
): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (entries.length === 0) {
      setActive(null);
      return;
    }
    const elements = entries.flatMap((entry) => {
      const element = editor.lexical.getElementByKey(entry.key);
      return element ? [[entry.key, element] as const] : [];
    });
    const pick = () => {
      const line = (elements[0]?.[1].ownerDocument.defaultView?.innerHeight ?? 0) * offset;
      let current = entries[0]?.key ?? null;
      for (const [key, element] of elements) {
        if (element.getBoundingClientRect().top > line + 1) break;
        current = key;
      }
      setActive(current);
    };
    pick();
    if (typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(pick, {
      rootMargin: `0px 0px -${Math.round((1 - offset) * 100)}% 0px`,
    });
    for (const [, element] of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [editor, entries, offset]);
  return active;
}

export interface TableOfContentsPanelProps
  extends Omit<ComponentPropsWithoutRef<'nav'>, 'children' | 'title'> {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Shown above the list; default the `toc.label` message. `null` for none. */
  title?: ReactNode;
  /**
   * Fold the list behind a button: `'auto'` (default) below `breakpoint`,
   * `true` always, `false` never.
   */
  collapsible?: boolean | 'auto';
  /** Where `'auto'` starts folding. Default `48rem`. */
  breakpoint?: string;
  /** How far down the viewport a heading counts as current, 0–1. Default 0.25. */
  activeOffset?: number;
  /** Called after a link took the reader to its heading. */
  onNavigate?: (entry: TocEntry) => void;
}

/**
 * The document's outline as a side panel: a `nav` of links to the
 * headings, indented by level, the one in view marked `aria-current`. It
 * sticks while the page scrolls; on narrow screens it folds behind a
 * button. Needs the `TableOfContents` extension.
 *
 * ```tsx
 * <div className="layout">
 *   <Editor editor={editor} />
 *   <TableOfContentsPanel editor={editor} />
 * </div>
 * ```
 */
export function TableOfContentsPanel({
  editor: editorProp,
  title,
  collapsible = 'auto',
  breakpoint = '48rem',
  activeOffset = 0.25,
  onNavigate,
  className,
  ...rest
}: TableOfContentsPanelProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor)
    throw new Error('teieditor: <TableOfContentsPanel> needs an `editor` prop or a provider');
  const entries = useOutline(editor);
  const active = useActiveHeading(editor, entries, activeOffset);
  const narrow = useMedia(
    collapsible === 'auto' ? `(max-width: ${breakpoint})` : collapsible ? 'all' : null,
  );
  const folds = collapsible === true || (collapsible === 'auto' && narrow);
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = title === undefined ? editor.t('toc.label') : title;

  const go = (event: MouseEvent<HTMLAnchorElement>, entry: TocEntry) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (!editor.commands.scrollToHeading(entry.key)) return;
    if (folds) setOpen(false);
    onNavigate?.(entry);
  };

  // Up and down between links; Home and End to the first and last.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href]'));
    const at = links.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    const to =
      event.key === 'ArrowDown'
        ? Math.min(at + 1, links.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(at - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? links.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    links[to]?.focus();
  };

  const list = (items: readonly TocTreeEntry[], depth: number): ReactNode => (
    <ol className="tei-toc-list" data-depth={depth}>
      {items.map((entry) => (
        <li key={entry.key} className="tei-toc-item">
          <a
            href={`#${entry.id}`}
            className="tei-toc-link"
            data-level={entry.level}
            aria-current={entry.key === active ? 'location' : undefined}
            onClick={(event) => go(event, entry)}
          >
            {entry.text || '\u00a0'}
          </a>
          {entry.children.length > 0 && list(entry.children, depth + 1)}
        </li>
      ))}
    </ol>
  );

  const shown = !folds || open;
  // In the editor's context, so its icons resolve outside the frame too.
  return (
    <TeiEditorContext.Provider value={editor}>
      <nav
        {...rest}
        className={cx('tei-portal', 'tei-toc', className)}
        aria-labelledby={label ? `${id}-title` : undefined}
        aria-label={label ? undefined : editor.t('toc.label')}
        data-tei-toc-panel=""
        data-folded={folds ? '' : undefined}
        onKeyDown={onKeyDown}
      >
        {folds ? (
          <button
            type="button"
            className="tei-toc-toggle"
            id={`${id}-title`}
            aria-expanded={open}
            aria-controls={`${id}-list`}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon icon="toc" />
            <span>{label || editor.t('toc.toggle')}</span>
            <Icon icon="chevronDown" className="tei-toc-chevron" />
          </button>
        ) : (
          label && (
            <p className="tei-toc-title" id={`${id}-title`}>
              {label}
            </p>
          )
        )}
        <div className="tei-toc-body" id={`${id}-list`} hidden={!shown}>
          {entries.length > 0 ? (
            list(outlineTree(entries), 0)
          ) : (
            <p className="tei-toc-empty">{editor.t('toc.empty')}</p>
          )}
        </div>
      </nav>
    </TeiEditorContext.Provider>
  );
}
