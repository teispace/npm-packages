'use client';

import { type ComponentPropsWithoutRef, type ReactNode, useEffect, useRef } from 'react';
import type { TeiEditorOptions } from '../../core/create.js';
import type { ContentFormat, TeiEditor } from '../../core/editor.js';
import { StarterKit } from '../../extensions/starter-kit/index.js';
import { TextStyle } from '../../extensions/text-style/index.js';
import { type ContentEditableProps, EditorContent, EditorProvider } from '../editor-content.js';
import { cx } from '../ui/context.js';
import { useTeiEditor } from '../use-tei-editor.js';
import { BubbleMenu } from './bubble-menu.js';
import { CodeBlockBar } from './code-block-bar.js';
import { EditorToolbar, type EditorToolbarProps, type ToolbarLayout } from './editor-toolbar.js';
import { LinkPopover } from './link-popover.js';
import { SlashMenu } from './slash-menu.js';

/**
 * Which UI comes with it.
 * - `full`: toolbar, bubble menu, slash menu, link popover, code block bar.
 * - `notion`: no toolbar; select text for the bubble menu, type `/` for blocks.
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
  /** The language picker and copy button on code blocks. */
  codeBlockBar?: EditorSlot;
  /** Below the document, inside the frame: a word count, a status line. */
  footer?: ReactNode;
}

const PRESETS: Record<EditorPreset, Required<Omit<EditorSlots, 'footer'>>> = {
  full: { toolbar: true, bubbleMenu: true, slashMenu: true, linkPopover: true, codeBlockBar: true },
  notion: {
    toolbar: false,
    bubbleMenu: true,
    slashMenu: true,
    linkPopover: true,
    codeBlockBar: true,
  },
  minimal: {
    toolbar: true,
    bubbleMenu: false,
    slashMenu: false,
    linkPopover: true,
    codeBlockBar: false,
  },
};

/** What each preset installs when `<Editor>` makes its own editor. */
const PRESET_EXTENSIONS: Record<EditorPreset, TeiEditorOptions['extensions']> = {
  full: [StarterKit, TextStyle],
  notion: [StarterKit, TextStyle],
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
        <EditorContent editor={editor} placeholder={placeholder} {...contentProps}>
          {slot(parts.linkPopover, <LinkPopover />)}
          {slot(parts.bubbleMenu, <BubbleMenu />)}
          {slot(parts.slashMenu, <SlashMenu />)}
          {slot(parts.codeBlockBar, <CodeBlockBar />)}
          {children}
        </EditorContent>
        {parts.footer}
      </div>
    </EditorProvider>
  );
}

function slot(value: EditorSlot | undefined, fallback: ReactNode): ReactNode {
  if (value === false || value === null || value === undefined) return null;
  return value === true ? fallback : value;
}
