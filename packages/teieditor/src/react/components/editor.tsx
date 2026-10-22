'use client';

import {
  type ComponentPropsWithoutRef,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { TeiEditorOptions } from '../../core/create.js';
import type { ContentFormat, TeiEditor } from '../../core/editor.js';
import type { TeiPreset } from '../../core/preset.js';
import { holdUi } from '../../core/ui-request.js';
import type { DateTimeStorage } from '../../extensions/date-time/index.js';
import type { EmbedStorage } from '../../extensions/embed/index.js';
import type { EmojiStorage } from '../../extensions/emoji/index.js';
import type { FindReplaceStorage } from '../../extensions/find-replace/index.js';
import type { ImageStorage } from '../../extensions/image/index.js';
import type { LinkStorage } from '../../extensions/link/index.js';
import { StarterKit } from '../../extensions/starter-kit/index.js';
import { type ContentEditableProps, EditorContent, EditorProvider } from '../editor-content.js';
import { cx } from '../ui/context.js';
import { useTeiEditor } from '../use-tei-editor.js';
import { EditorToolbar, type EditorToolbarProps, type ToolbarLayout } from './editor-toolbar.js';

/**
 * The parts that show only once there is something to act on (a selection,
 * a `/`, a table, an image, a code block) load after the editor, so they
 * cost nothing up front.
 */
const LinkPopover = lazy(() =>
  import('./link-popover.js').then((module) => ({ default: module.LinkPopover })),
);
const BubbleMenu = lazy(() =>
  import('./bubble-menu.js').then((module) => ({ default: module.BubbleMenu })),
);
const SlashMenu = lazy(() =>
  import('./slash-menu.js').then((module) => ({ default: module.SlashMenu })),
);
// In the same boundary as the slash menu, so its Image always finds it.
const ImageInsertPopover = lazy(() =>
  import('./image-insert.js').then((module) => ({ default: module.ImageInsertPopover })),
);
const CodeBlockBar = lazy(() =>
  import('./code-block-bar.js').then((module) => ({ default: module.CodeBlockBar })),
);
const TableControls = lazy(() =>
  import('./table-controls.js').then((module) => ({ default: module.TableControls })),
);
const FileControls = lazy(() =>
  import('./file-controls.js').then((module) => ({ default: module.FileControls })),
);
const ImageControls = lazy(() =>
  import('./image-controls.js').then((module) => ({ default: module.ImageControls })),
);
const LazyImageControls = () => <ImageControls insert={false} />;
const BlockHandle = lazy(() =>
  import('./block-handle.js').then((module) => ({ default: module.BlockHandle })),
);
const ContextMenu = lazy(() =>
  import('./context-menu.js').then((module) => ({ default: module.ContextMenu })),
);
const CalloutMenu = lazy(() =>
  import('./callout-menu.js').then((module) => ({ default: module.CalloutMenu })),
);
const ColumnsMenu = lazy(() =>
  import('./columns-menu.js').then((module) => ({ default: module.ColumnsMenu })),
);
const DateTimePicker = lazy(() =>
  import('./date-time-picker.js').then((module) => ({ default: module.DateTimePicker })),
);
const FindReplaceBar = lazy(() =>
  import('./find-replace-bar.js').then((module) => ({ default: module.FindReplaceBar })),
);
const RubyPopover = lazy(() =>
  import('./ruby-popover.js').then((module) => ({ default: module.RubyPopover })),
);
const TypeaheadMenu = lazy(() =>
  import('./typeahead-menu.js').then((module) => ({ default: module.TypeaheadMenu })),
);
const EmojiPicker = lazy(() =>
  import('./emoji-picker.js').then((module) => ({ default: module.EmojiPicker })),
);
const StickyMenu = lazy(() =>
  import('./sticky-menu.js').then((module) => ({ default: module.StickyMenu })),
);
const EmbedControls = lazy(() =>
  import('./embed-controls.js').then((module) => ({ default: module.EmbedControls })),
);
const WordCount = lazy(() =>
  import('./word-count.js').then((module) => ({ default: module.WordCount })),
);

/** A part of the UI: `false` leaves it out, a node replaces it, `true` keeps the default. */
export type EditorSlot = boolean | ReactNode;

export interface EditorSlots {
  toolbar?: EditorSlot;
  bubbleMenu?: EditorSlot;
  slashMenu?: EditorSlot;
  linkPopover?: EditorSlot;
  /** The handle beside each block (drag it, or click for its menu) and its + button. */
  blockHandle?: EditorSlot;
  /** The editor's own right-click menu: clipboard, link, the selected node's actions, the table's, the block's. */
  contextMenu?: EditorSlot;
  /** The language picker and copy button on code blocks. */
  codeBlockBar?: EditorSlot;
  /** The cell menu, + bars and column resizing on tables. */
  tableControls?: EditorSlot;
  /** The insert popover, the toolbar over a selected image and its resize handles. */
  imageControls?: EditorSlot;
  /** The toolbar over a selected file: download, rename, replace. */
  fileControls?: EditorSlot;
  /** The form to embed a link, the offer to embed a pasted one, the toolbar over a selected embed. */
  embedControls?: EditorSlot;
  /** The menu a callout's icon opens: its kinds, and taking it away. */
  calloutMenu?: EditorSlot;
  /** The menu a sticky note's swatch opens: its colours, and taking it away. */
  stickyMenu?: EditorSlot;
  /** The menu a columns block's control opens: its layouts, adding and removing columns. */
  columnsMenu?: EditorSlot;
  /** The picker a date opens: its day, and its time. */
  dateTimePicker?: EditorSlot;
  /** The find and replace bar, from ⌘F. */
  findReplace?: EditorSlot;
  /** Words and characters under the document, and the limit when one is set. */
  wordCount?: EditorSlot;
  /** The form for a ruby annotation's reading. */
  rubyPopover?: EditorSlot;
  /** The list for `@` mentions and `:` emoji as you type them. */
  typeaheadMenu?: EditorSlot;
  /** The emoji picker, from the toolbar or ⌘⌥E. */
  emojiPicker?: EditorSlot;
  /** Below the document, inside the frame: a word count, a status line. */
  footer?: ReactNode;
}

/** What `<Editor>` installs without `preset` or `extensions`. */
const DEFAULT_EXTENSIONS = [StarterKit];

/** An installed extension by its directory under `extensions/`, without importing it. */
const NAME = (feature: string) => `@teispace/teieditor/${feature}`;

/** `data-*` attributes, which TypeScript only accepts in JSX otherwise. */
type DataAttributes = { [key: `data-${string}`]: string | undefined };

export interface EditorProps extends Partial<Omit<TeiEditorOptions, 'editable'>> {
  /**
   * An editor from `useTeiEditor`, to drive from outside. Without one,
   * `<Editor>` makes its own from the other options (StarterKit by
   * default), once: later changes to them are ignored, except `editable`.
   */
  editor?: TeiEditor;
  /**
   * A ready set of extensions and the UI that goes with them, from its own
   * entry: `import { full } from '@teispace/teieditor/presets/full'`. Without
   * one, StarterKit (or your `extensions`) and every part they have UI for.
   */
  preset?: TeiPreset;
  /** Leave out or replace any part of the preset. */
  slots?: EditorSlots;
  /** The toolbar's layout; see `EditorToolbar`. */
  toolbar?: ToolbarLayout;
  /** Keep the toolbar in view while the page scrolls. */
  stickyToolbar?: boolean;
  /** What the toolbar does with what doesn't fit; see `EditorToolbar`. Default `menu`. */
  toolbarOverflow?: EditorToolbarProps['overflow'];
  /** Read-only with `false`. This one may change after mount. */
  editable?: boolean;
  /** Called after each change to the document, with it in `format`. */
  onChange?: (value: unknown, editor: TeiEditor) => void;
  /** What `onChange` gets. Default `json`. */
  format?: ContentFormat;
  /** Shown while the document is empty. */
  placeholder?: string;
  /**
   * The document as HTML from `renderToHTML`, shown by server rendering
   * until the editor mounts: no blank editor, no layout shift. See
   * `ContentEditableProps.initialHTML`.
   */
  initialHTML?: string;
  /** Props for the editable document itself (`aria-label`, `className`, …). */
  contentProps?: Omit<ContentEditableProps, 'placeholder'> & DataAttributes;
  /** Props for the outer frame (`id`, `style`, `data-*`, …). */
  frameProps?: Omit<ComponentPropsWithoutRef<'div'>, 'children'> & DataAttributes;
  /** A border and rounded corners round the whole editor. Default true. */
  bordered?: boolean;
  /** Force a colour scheme, or follow the system's; by default it follows the page (`.dark` or `data-theme`). */
  colorScheme?: 'light' | 'dark' | 'system';
  className?: string;
  /** Your own UI, inside the editor's context, after the built-in parts. */
  children?: ReactNode;
}

/**
 * The whole editor in one element:
 *
 * ```tsx
 * import { Editor } from '@teispace/teieditor/react';
 * import '@teispace/teieditor/styles.css';
 *
 * <Editor content={saved} onChange={save} placeholder="Write something…" />
 * ```
 *
 * Every part comes from the installed extensions, so adding one adds its
 * buttons, menu entries and shortcuts. For full control, build the same
 * thing from `useTeiEditor`, `EditorContent` and the parts it uses.
 *
 * The parts for tables, images, files and code blocks load just after the editor
 * shows (they appear only once there is one to act on); the frame gets
 * `data-tei-ready` when they are in.
 */
export function Editor(props: EditorProps) {
  return props.editor ? <EditorFrame {...props} editor={props.editor} /> : <OwnEditor {...props} />;
}

function OwnEditor(props: EditorProps) {
  const {
    preset,
    slots,
    toolbar,
    stickyToolbar,
    toolbarOverflow,
    editable,
    onChange,
    format,
    placeholder,
    initialHTML,
    contentProps,
    frameProps,
    bordered,
    colorScheme,
    className,
    children,
    extensions = preset?.extensions ?? DEFAULT_EXTENSIONS,
    ...options
  } = props;
  const editor = useTeiEditor({ ...options, extensions, editable });
  return <EditorFrame {...props} editor={editor} />;
}

function EditorFrame({
  editor,
  preset,
  slots,
  toolbar,
  stickyToolbar,
  toolbarOverflow,
  editable,
  onChange,
  format = 'json',
  placeholder,
  initialHTML,
  contentProps,
  frameProps,
  bordered = true,
  colorScheme,
  className,
  children,
}: EditorProps & { editor: TeiEditor }) {
  const parts: EditorSlots = { ...preset?.ui, ...slots };
  const has = (feature: string) => editor.extension(NAME(feature)) !== undefined;
  const storage = <S,>(feature: string) =>
    (editor.extension(NAME(feature))?.output as { storage?: S } | undefined)?.storage;

  useEffect(() => {
    if (editable !== undefined && editable !== editor.isEditable) editor.setEditable(editable);
  }, [editor, editable]);

  // The latest callback, without re-subscribing on every render.
  // The parts that load later mount after hydration: a server has nothing
  // to show for them, and `renderToString` cannot render lazy ones.
  // `data-tei-ready` once they are in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [ready, setReady] = useState(false);
  // A request before its UI has loaded (⌘K, the slash menu's Image): hold
  // the UI's place, so the request stands and the UI takes it as it loads.
  const linkEdit = builtIn(parts.linkPopover) ? storage<LinkStorage>('link')?.edit : undefined;
  const imageInsert = builtIn(parts.imageControls)
    ? storage<ImageStorage>('image')?.insert
    : undefined;
  const embedInsert = builtIn(parts.embedControls)
    ? storage<EmbedStorage>('embed')?.insert
    : undefined;
  const datePick = builtIn(parts.dateTimePicker)
    ? storage<DateTimeStorage>('date-time')?.picker
    : undefined;
  const findBar = builtIn(parts.findReplace)
    ? storage<FindReplaceStorage>('find-replace')?.ui
    : undefined;
  const emojiPick = builtIn(parts.emojiPicker) ? storage<EmojiStorage>('emoji')?.picker : undefined;
  useEffect(() => {
    if (ready) return;
    const releases = [linkEdit, imageInsert, embedInsert, datePick, findBar, emojiPick].flatMap(
      (request) => (request ? [holdUi(request)] : []),
    );
    return () => {
      for (const release of releases) release();
    };
  }, [ready, linkEdit, imageInsert, embedInsert, datePick, findBar, emojiPick]);
  // The gutter the handles sit in, from the first render (the server's too).
  const handles = has('blocks') && slot(parts.blockHandle, true) !== null;
  const change = useRef({ onChange, format });
  change.current = { onChange, format };
  useEffect(
    () =>
      editor.on('onUpdate', () => {
        // Only document changes reach `onUpdate`, not selection moves.
        const { onChange: callback, format: as } = change.current;
        if (callback) callback(editor.getContent(as), editor);
      }),
    [editor],
  );

  // The whole frame is in the editor's context: a toolbar or footer slot of your own can use it.
  return (
    <EditorProvider editor={editor}>
      <div
        {...frameProps}
        className={cx('tei', className, frameProps?.className)}
        data-tei-bordered={bordered ? '' : undefined}
        data-theme={colorScheme}
        data-tei-frame=""
        data-tei-preset={preset?.name}
        data-tei-handles={handles ? '' : undefined}
        data-tei-ready={ready ? '' : undefined}
      >
        {slot(
          parts.toolbar,
          <EditorToolbar
            editor={editor}
            layout={toolbar}
            sticky={stickyToolbar}
            overflow={toolbarOverflow}
          />,
        )}
        <EditorContent
          editor={editor}
          placeholder={placeholder}
          initialHTML={initialHTML}
          {...contentProps}
        >
          {mounted && (
            <Suspense fallback={null}>
              {slot(parts.linkPopover, <LinkPopover />)}
              {slot(parts.bubbleMenu, <BubbleMenu />)}
              {slot(parts.slashMenu, <SlashMenu />)}
              {has('blocks') && slot(parts.blockHandle, <BlockHandle />)}
              {slot(parts.contextMenu, <ContextMenu />)}
              {has('image') && builtIn(parts.imageControls) && (
                <ImageInsertPopover editor={editor} />
              )}
              {has('code-block') && slot(parts.codeBlockBar, <CodeBlockBar />)}
              {has('table') && slot(parts.tableControls, <TableControls />)}
              {has('image') && slot(parts.imageControls, <LazyImageControls />)}
              {has('file') && slot(parts.fileControls, <FileControls />)}
              {has('embed') && slot(parts.embedControls, <EmbedControls />)}
              {has('callout') && slot(parts.calloutMenu, <CalloutMenu />)}
              {has('sticky-note') && slot(parts.stickyMenu, <StickyMenu />)}
              {has('columns') && slot(parts.columnsMenu, <ColumnsMenu />)}
              {has('date-time') && slot(parts.dateTimePicker, <DateTimePicker />)}
              {has('find-replace') && slot(parts.findReplace, <FindReplaceBar />)}
              {has('ruby') && slot(parts.rubyPopover, <RubyPopover />)}
              {has('typeahead') && slot(parts.typeaheadMenu, <TypeaheadMenu />)}
              {has('emoji') && slot(parts.emojiPicker, <EmojiPicker />)}
              <Ready onReady={setReady} />
            </Suspense>
          )}
          {children}
        </EditorContent>
        {has('character-count') &&
          slot(
            parts.wordCount,
            // The line holds its place while the count loads: nothing below moves.
            mounted ? (
              <Suspense fallback={<WordCountPlaceholder />}>
                <WordCount />
              </Suspense>
            ) : (
              <WordCountPlaceholder />
            ),
          )}
        {parts.footer}
      </div>
    </EditorProvider>
  );
}

function WordCountPlaceholder() {
  return (
    <div className="tei-word-count" aria-hidden="true">
      {'\u00a0'}
    </div>
  );
}

/** Rendered once everything in its Suspense boundary has loaded. */
function Ready({ onReady }: { onReady: (ready: true) => void }) {
  useEffect(() => onReady(true), [onReady]);
  return null;
}

/** A part left as it comes: on, and the built-in one. */
const builtIn = (value: EditorSlot | undefined) => value === undefined || value === true;

function slot(value: EditorSlot | undefined, fallback: ReactNode): ReactNode {
  if (value === false || value === null) return null;
  return builtIn(value) ? fallback : value;
}
