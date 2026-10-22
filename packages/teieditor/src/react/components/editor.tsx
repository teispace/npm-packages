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
import { holdUi } from '../../core/ui-request.js';
import { Blocks } from '../../extensions/blocks/index.js';
import { Callout } from '../../extensions/callout/index.js';
import { Card } from '../../extensions/card/index.js';
import { CodeBlock } from '../../extensions/code-block/index.js';
import { Collapsible } from '../../extensions/collapsible/index.js';
import { Columns } from '../../extensions/columns/index.js';
import { DateTime, type DateTimeStorage } from '../../extensions/date-time/index.js';
import { Embed, type EmbedStorage } from '../../extensions/embed/index.js';
import { FileAttachment } from '../../extensions/file/index.js';
import { FindReplace, type FindReplaceStorage } from '../../extensions/find-replace/index.js';
import { Image, type ImageStorage } from '../../extensions/image/index.js';
import { Link, type LinkStorage } from '../../extensions/link/index.js';
import { PageBreak } from '../../extensions/page-break/index.js';
import { Poll } from '../../extensions/poll/index.js';
import { PullQuote } from '../../extensions/pull-quote/index.js';
import { StarterKit } from '../../extensions/starter-kit/index.js';
import { StickyNote } from '../../extensions/sticky-note/index.js';
import { Table } from '../../extensions/table/index.js';
import { TextStyle } from '../../extensions/text-style/index.js';
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
const StickyMenu = lazy(() =>
  import('./sticky-menu.js').then((module) => ({ default: module.StickyMenu })),
);
const EmbedControls = lazy(() =>
  import('./embed-controls.js').then((module) => ({ default: module.EmbedControls })),
);

/**
 * Which UI comes with it.
 * - `full`: toolbar, bubble menu, slash menu, link popover, block handles, context menu, code block bar, table, image, file and embed controls, the callout, sticky note and columns menus, the date picker, find and replace.
 * - `notion`: no toolbar; select text for the bubble menu, type `/` or press + for blocks, drag a block by its handle.
 * - `minimal`: a toolbar and links, nothing floating: comment boxes, forms.
 */
export type EditorPreset = 'full' | 'notion' | 'minimal';

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
  /** Below the document, inside the frame: a word count, a status line. */
  footer?: ReactNode;
}

const PRESETS: Record<EditorPreset, Required<Omit<EditorSlots, 'footer'>>> = {
  full: {
    toolbar: true,
    bubbleMenu: true,
    slashMenu: true,
    linkPopover: true,
    blockHandle: true,
    contextMenu: true,
    codeBlockBar: true,
    tableControls: true,
    imageControls: true,
    fileControls: true,
    embedControls: true,
    calloutMenu: true,
    stickyMenu: true,
    columnsMenu: true,
    dateTimePicker: true,
    findReplace: true,
  },
  notion: {
    toolbar: false,
    bubbleMenu: true,
    slashMenu: true,
    linkPopover: true,
    blockHandle: true,
    contextMenu: true,
    codeBlockBar: true,
    tableControls: true,
    imageControls: true,
    fileControls: true,
    embedControls: true,
    calloutMenu: true,
    stickyMenu: true,
    columnsMenu: true,
    dateTimePicker: true,
    findReplace: true,
  },
  minimal: {
    toolbar: true,
    bubbleMenu: false,
    slashMenu: false,
    linkPopover: true,
    blockHandle: false,
    contextMenu: false,
    codeBlockBar: false,
    tableControls: false,
    imageControls: false,
    fileControls: false,
    embedControls: false,
    calloutMenu: false,
    stickyMenu: false,
    columnsMenu: false,
    dateTimePicker: false,
    findReplace: false,
  },
};

/** What each preset installs when `<Editor>` makes its own editor. */
const PRESET_EXTENSIONS: Record<EditorPreset, TeiEditorOptions['extensions']> = {
  full: [
    StarterKit,
    TextStyle,
    Blocks,
    PullQuote,
    Callout,
    Collapsible,
    Columns,
    Card,
    StickyNote,
    Poll,
    DateTime,
    FindReplace,
    PageBreak,
    Table,
    Image,
    FileAttachment,
    Embed,
  ],
  notion: [
    StarterKit,
    TextStyle,
    Blocks,
    PullQuote,
    Callout,
    Collapsible,
    Columns,
    Card,
    StickyNote,
    Poll,
    DateTime,
    FindReplace,
    PageBreak,
    Table,
    Image,
    FileAttachment,
    Embed,
  ],
  minimal: [StarterKit],
};

/** `data-*` attributes, which TypeScript only accepts in JSX otherwise. */
type DataAttributes = { [key: `data-${string}`]: string | undefined };

export interface EditorProps extends Partial<Omit<TeiEditorOptions, 'editable'>> {
  /**
   * An editor from `useTeiEditor`, to drive from outside. Without one,
   * `<Editor>` makes its own from the other options (StarterKit by
   * default), once: later changes to them are ignored, except `editable`.
   */
  editor?: TeiEditor;
  /** Default `full`. */
  preset?: EditorPreset;
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
    extensions = PRESET_EXTENSIONS[preset ?? 'full'],
    ...options
  } = props;
  const editor = useTeiEditor({ ...options, extensions, editable });
  return <EditorFrame {...props} editor={editor} />;
}

function EditorFrame({
  editor,
  preset = 'full',
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
  const parts = { ...PRESETS[preset], ...slots };

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
  const linkEdit = slot(parts.linkPopover, true)
    ? (editor.extension(Link)?.output.storage as LinkStorage | undefined)?.edit
    : undefined;
  const imageInsert =
    parts.imageControls === true
      ? (editor.extension(Image)?.output.storage as ImageStorage | undefined)?.insert
      : undefined;
  const embedInsert =
    parts.embedControls === true
      ? (editor.extension(Embed)?.output.storage as EmbedStorage | undefined)?.insert
      : undefined;
  const datePick =
    parts.dateTimePicker === true
      ? (editor.extension(DateTime)?.output.storage as DateTimeStorage | undefined)?.picker
      : undefined;
  const findBar =
    parts.findReplace === true
      ? (editor.extension(FindReplace)?.output.storage as FindReplaceStorage | undefined)?.ui
      : undefined;
  useEffect(() => {
    if (ready) return;
    const releases = [linkEdit, imageInsert, embedInsert, datePick, findBar].flatMap((request) =>
      request ? [holdUi(request)] : [],
    );
    return () => {
      for (const release of releases) release();
    };
  }, [ready, linkEdit, imageInsert, embedInsert, datePick, findBar]);
  // The gutter the handles sit in, from the first render (the server's too).
  const handles = editor.extension(Blocks) !== undefined && slot(parts.blockHandle, true) !== null;
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
        data-tei-preset={preset}
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
              {editor.extension(Blocks) && slot(parts.blockHandle, <BlockHandle />)}
              {slot(parts.contextMenu, <ContextMenu />)}
              {editor.extension(Image) && parts.imageControls === true && (
                <ImageInsertPopover editor={editor} />
              )}
              {editor.extension(CodeBlock) && slot(parts.codeBlockBar, <CodeBlockBar />)}
              {editor.extension(Table) && slot(parts.tableControls, <TableControls />)}
              {editor.extension(Image) && slot(parts.imageControls, <LazyImageControls />)}
              {editor.extension(FileAttachment) && slot(parts.fileControls, <FileControls />)}
              {editor.extension(Embed) && slot(parts.embedControls, <EmbedControls />)}
              {editor.extension(Callout) && slot(parts.calloutMenu, <CalloutMenu />)}
              {editor.extension(StickyNote) && slot(parts.stickyMenu, <StickyMenu />)}
              {editor.extension(Columns) && slot(parts.columnsMenu, <ColumnsMenu />)}
              {editor.extension(DateTime) && slot(parts.dateTimePicker, <DateTimePicker />)}
              {editor.extension(FindReplace) && slot(parts.findReplace, <FindReplaceBar />)}
              <Ready onReady={setReady} />
            </Suspense>
          )}
          {children}
        </EditorContent>
        {parts.footer}
      </div>
    </EditorProvider>
  );
}

/** Rendered once everything in its Suspense boundary has loaded. */
function Ready({ onReady }: { onReady: (ready: true) => void }) {
  useEffect(() => onReady(true), [onReady]);
  return null;
}

function slot(value: EditorSlot | undefined, fallback: ReactNode): ReactNode {
  if (value === false || value === null || value === undefined) return null;
  return value === true ? fallback : value;
}
