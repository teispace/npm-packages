import { effect } from '@lexical/extension';
import { createDOMRange } from '@lexical/selection';
import {
  $addUpdateTag,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  FOCUS_COMMAND,
  getRegisteredNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  mergeRegister,
  type SerializedEditorState,
} from 'lexical';
import { defineTeiExtension } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import { download, eraser, fileText, lock, upload } from '../../icons/index.js';
import { chooseFiles } from '../../utils/files.js';
import { fullNode, terseNode } from './terse.js';

export { fullNode, terseNode } from './terse.js';

/** The formats a document downloads as and opens from. */
export type DocumentFormat = 'json' | 'html' | 'markdown' | 'text';

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Make the document editable, or read-only. */
    setEditable: [editable: boolean];
    toggleEditable: [];
    /** Empty the document, as one undo step. */
    clearDocument: [];
    /** Save the document as a file the browser downloads. */
    downloadAs: [format: DocumentFormat, filename?: string];
    /** Ask for a file and replace the document with it. */
    openFile: [];
  }
  interface TeiActiveStates {
    readOnly: [];
  }
}

export interface DocumentActionsOptions {
  /** A downloaded file's name, before its extension. Default `'document'`. */
  filename: string;
  /** Download JSON without its default fields (see `exportJSON`). Default true. */
  terseJSON: boolean;
  /** The largest file `openFile` reads, in bytes. Default 5 MB. */
  maxFileSize: number;
  /**
   * Told when a file cannot be opened (too large, not a document, not
   * valid), with a translated message. Default: announced to screen
   * readers and logged as a warning. Nothing is ever thrown.
   */
  onError: ((error: Error, editor: TeiEditor) => void) | null;
  /**
   * Keep drawing the selection while focus is elsewhere (a toolbar's
   * popover, a dialog), through the CSS Custom Highlight API. Default true.
   */
  keepSelection: boolean;
}

/** Terse JSON: like Lexical's, without the fields that hold their defaults. */
export interface TerseNode {
  type: string;
  children?: TerseNode[];
  [field: string]: unknown;
}

const EXTENSIONS: Record<string, DocumentFormat> = {
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  txt: 'text',
  text: 'text',
};
const TYPES: Record<DocumentFormat, string> = {
  json: 'application/json',
  html: 'text/html',
  markdown: 'text/markdown',
  text: 'text/plain',
};
const ENDINGS: Record<DocumentFormat, string> = {
  json: 'json',
  html: 'html',
  markdown: 'md',
  text: 'txt',
};

/** What the file chooser offers. */
export const DOCUMENT_ACCEPT =
  '.json,.md,.markdown,.html,.htm,.txt,application/json,text/markdown,text/html,text/plain';

/**
 * The document as Lexical JSON. With `terse`, every field holding its
 * default (`format: 0`, `style: ''`, `indent: 0`, `direction: null`,
 * `version: 1`, …) is left out; `importJSON` puts them back.
 */
export function exportJSON(editor: TeiEditor, options?: { terse?: false }): SerializedEditorState;
export function exportJSON(editor: TeiEditor, options: { terse: true }): { root: TerseNode };
export function exportJSON(
  editor: TeiEditor,
  { terse = false }: { terse?: boolean } = {},
): SerializedEditorState | { root: TerseNode } {
  const state = editor.getJSON();
  if (!terse) return state;
  return { root: terseNode(state.root as unknown as Record<string, unknown>) as TerseNode };
}

const MAX_DEPTH = 200;

/** Refuse JSON that is not a document this editor can hold, before touching anything. */
function check(editor: TeiEditor, root: unknown): void {
  const visit = (node: unknown, depth: number, slot = false) => {
    if (depth > MAX_DEPTH) throw new TypeError('teieditor: JSON content nests too deeply');
    if (typeof node !== 'object' || node === null || Array.isArray(node))
      throw new TypeError('teieditor: JSON content holds something that is not a node');
    const { type, children, $slots } = node as {
      type?: unknown;
      children?: unknown;
      $slots?: unknown;
    };
    // A slot's own top (an image's caption) may be untyped; what it holds is not.
    if (
      !(slot && type === undefined) &&
      (typeof type !== 'string' || !getRegisteredNode(editor.lexical, type))
    )
      throw new TypeError(
        `teieditor: JSON content has a node this editor cannot hold: ${String(type)}`,
      );
    if ($slots !== undefined) {
      if (typeof $slots !== 'object' || $slots === null)
        throw new TypeError('teieditor: JSON node slots must be an object');
      for (const inner of Object.values($slots)) visit(inner, depth + 1, true);
    }
    if (children === undefined) return;
    if (!Array.isArray(children))
      throw new TypeError('teieditor: JSON node children must be a list');
    for (const child of children) visit(child, depth + 1);
  };
  visit(root, 0);
  if ((root as { type: string }).type !== 'root')
    throw new TypeError('teieditor: JSON content needs a { root: { type: "root" } } object');
}

/**
 * Replace the document with Lexical JSON, full or terse (an object or its
 * string). Content that is not valid is refused whole, with a TypeError,
 * and the document stays as it was.
 */
export function importJSON(editor: TeiEditor, value: unknown): void {
  const state = (typeof value === 'string' ? JSON.parse(value) : value) as { root?: unknown };
  check(editor, state?.root);
  const root = fullNode(state.root as Record<string, unknown>);
  editor.setContent({ root }, 'json');
}

const escapeText = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);

/** The document as file contents in a format. */
export function serializeDocument(editor: TeiEditor, format: DocumentFormat, title = ''): string {
  if (format === 'json') {
    const terse = options(editor)?.terseJSON ?? true;
    return JSON.stringify(terse ? exportJSON(editor, { terse: true }) : exportJSON(editor));
  }
  if (format === 'html') {
    // A page of its own: no script, no style, nothing for a CSP to stop.
    return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeText(title)}</title></head><body>\n${editor.getHTML()}\n</body></html>\n`;
  }
  return String(editor.getContent(format));
}

const options = (editor: TeiEditor) => {
  const found = editor.extension(DocumentActions);
  if (!found) return undefined;
  const o = found.output.options;
  return {
    filename: o.filename.value,
    terseJSON: o.terseJSON.value,
    maxFileSize: o.maxFileSize.value,
    onError: o.onError.value,
  };
};

/** Whether the editor can write a format now (the markdown source view writes only text ones). */
function canWrite(editor: TeiEditor, format: DocumentFormat): boolean {
  if (format !== 'json' && !editor.formats.includes(format)) return false;
  const loose = editor as unknown as { isActive(name: string): boolean };
  return !(loose.isActive('markdownSource') && (format === 'json' || format === 'html'));
}

/**
 * Download the document as a file: a Blob behind an object URL, so nothing
 * inline is needed (a strict CSP allows it). `false` when the format is
 * not available.
 */
export function downloadAs(editor: TeiEditor, format: DocumentFormat, filename?: string): boolean {
  if (!canWrite(editor, format)) return false;
  const name = filename ?? `${options(editor)?.filename ?? 'document'}.${ENDINGS[format]}`;
  const blob = new Blob([serializeDocument(editor, format, name.replace(/\.[^.]*$/, ''))], {
    type: `${TYPES[format]};charset=utf-8`,
  });
  const doc = editor.lexical.getRootElement()?.ownerDocument ?? document;
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** The format a file holds, by its name, then its type. */
export function formatOfFile(file: Pick<File, 'name' | 'type'>): DocumentFormat | null {
  const ending = /\.([a-z]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (ending && EXTENSIONS[ending]) return EXTENSIONS[ending] as DocumentFormat;
  const type = file.type.split(';')[0]?.trim().toLowerCase();
  const found = (Object.entries(TYPES) as [DocumentFormat, string][]).find(([, t]) => t === type);
  return found ? found[0] : null;
}

export interface OpenFileOptions {
  /** Instead of the `onError` option. */
  onError?: (error: Error, editor: TeiEditor) => void;
  /** Instead of the `maxFileSize` option. */
  maxFileSize?: number;
}

/**
 * Replace the document with a file's contents: JSON (full or terse),
 * markdown, HTML (through the sanitising import) or text. A file too
 * large, of another kind, not text, or not valid is refused and reported
 * through `onError`; the document stays as it was. Resolves `true` once
 * the file is in.
 */
export async function importFile(
  editor: TeiEditor,
  file: File,
  { onError, maxFileSize }: OpenFileOptions = {},
): Promise<boolean> {
  const settings = options(editor);
  const fail = (id: string, values?: Record<string, string | number>, cause?: unknown) => {
    const error = new Error(editor.t(id, values), cause === undefined ? undefined : { cause });
    const report = onError ?? settings?.onError ?? defaultOnError;
    report(error, editor);
    return false;
  };
  const max = maxFileSize ?? settings?.maxFileSize ?? 5 * 1024 * 1024;
  const format = formatOfFile(file);
  if (!format || (format !== 'json' && !editor.formats.includes(format)))
    return fail('document.error.type', { name: file.name });
  if (file.size > max)
    return fail('document.error.size', { name: file.name, max: `${Math.round(max / 1024)} KB` });
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    return fail('document.error.read', { name: file.name }, error);
  }
  // Binary data with a document's name.
  if (text.includes('\u0000')) return fail('document.error.read', { name: file.name });
  try {
    if (format === 'json') importJSON(editor, text);
    else editor.setContent(text, format);
  } catch (error) {
    return fail('document.error.invalid', { name: file.name }, error);
  }
  return true;
}

/** Ask for a file (from a click: browsers open choosers for a user's gesture only) and open it. */
export async function openFile(
  editor: TeiEditor,
  settings: OpenFileOptions = {},
): Promise<boolean> {
  const doc = editor.lexical.getRootElement()?.ownerDocument ?? document;
  const [file] = await chooseFiles(doc, { accept: DOCUMENT_ACCEPT });
  return file ? importFile(editor, file, settings) : false;
}

function defaultOnError(error: Error, editor: TeiEditor): void {
  editor.announce(error.message);
  console.warn('teieditor:', error.message);
}

const HIGHLIGHT = 'tei-kept-selection';

interface HighlightRegistry {
  get(name: string): (Set<AbstractRange> & object) | undefined;
  set(name: string, highlight: Set<AbstractRange>): void;
  delete(name: string): void;
}

/** The selection as a DOM range, when there is text selected. */
function $selectedRange(lexical: LexicalEditor): Range | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
  return createDOMRange(
    lexical,
    selection.anchor.getNode(),
    selection.anchor.offset,
    selection.focus.getNode(),
    selection.focus.offset,
  );
}

/**
 * While focus is outside the editor, draw its selection as a highlight
 * (`::highlight(tei-kept-selection)`): the text a toolbar popover will act
 * on stays visible. Nothing is added to the document.
 */
function keepSelection(editor: TeiEditor, lexical: LexicalEditor): (() => void) | undefined {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
  const Highlight = (globalThis as { Highlight?: new () => Set<AbstractRange> }).Highlight;
  if (!registry || !Highlight) return undefined;
  let kept: Range | null = null;
  const clear = () => {
    if (!kept) return;
    const highlight = registry.get(HIGHLIGHT);
    highlight?.delete(kept);
    if (highlight && highlight.size === 0) registry.delete(HIGHLIGHT);
    kept = null;
  };
  const keep = (range: Range | null) => {
    clear();
    if (!range || editor.isFocused) return;
    kept = range;
    const highlight = registry.get(HIGHLIGHT) ?? new Highlight();
    highlight.add(range);
    registry.set(HIGHLIGHT, highlight);
  };
  return mergeRegister(
    lexical.registerCommand(
      BLUR_COMMAND,
      () => {
        keep($selectedRange(lexical));
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    lexical.registerCommand(
      FOCUS_COMMAND,
      () => {
        clear();
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    // A change while away (a link added from a popover) moves what is kept.
    lexical.registerUpdateListener(({ editorState }) => {
      if (kept) keep(editorState.read(() => $selectedRange(lexical)));
    }),
    clear,
  );
}

/**
 * Document-level actions: read-only on and off, clearing the document,
 * downloading it as JSON, HTML, markdown or text, opening a file, and
 * keeping the selection visible while focus is elsewhere. `exportJSON`,
 * `importJSON`, `downloadAs`, `openFile` and `importFile` are also plain
 * functions, for code of your own.
 */
export const DocumentActions = defineTeiExtension({
  name: '@teispace/teieditor/document-actions',
  config: {
    filename: 'document',
    terseJSON: true,
    maxFileSize: 5 * 1024 * 1024,
    onError: null,
    keepSelection: true,
  } as DocumentActionsOptions,
  commands: {
    setEditable: {
      run: ({ editor }, editable: boolean) => {
        editor.setEditable(editable);
      },
    },
    toggleEditable: {
      run: ({ editor }) => {
        editor.setEditable(!editor.isEditable);
      },
    },
    clearDocument: {
      run: ({ editor }) => {
        if (!editor.isEditable) return false;
        const paragraph = $createParagraphNode();
        $getRoot().clear().append(paragraph);
        paragraph.select();
        $addUpdateTag(HISTORY_PUSH_TAG);
      },
      can: ({ editor }) => editor.isEditable && !editor.isEmpty,
    },
    downloadAs: {
      run: ({ editor }, format: DocumentFormat, filename?: string) =>
        downloadAs(editor, format, filename),
      can: ({ editor }, format: DocumentFormat) => canWrite(editor, format),
    },
    openFile: {
      run: ({ editor }) => {
        if (!editor.isEditable) return false;
        void openFile(editor);
      },
      can: ({ editor }) => editor.isEditable,
    },
  },
  active: { readOnly: ({ editor }) => !editor.isEditable },
  register: ({ editor, lexical, options: o }) =>
    effect(() => (o.keepSelection ? keepSelection(editor, lexical) : undefined)),
  icons: { readOnly: lock, openFile: upload, download, clearDocument: eraser, document: fileText },
  messages: {
    'view.readOnly': 'Read only',
    'document.open': 'Import…',
    'document.export': 'Export',
    'document.export.json': 'JSON',
    'document.export.html': 'HTML',
    'document.export.markdown': 'Markdown',
    'document.export.text': 'Plain text',
    'document.clear': 'Clear document',
    'document.clear.confirm': 'Clear the whole document?',
    'document.clear.hint': 'You can undo this.',
    'document.cancel': 'Cancel',
    'document.error.type': '“{name}” is not a document this editor can open.',
    'document.error.size': '“{name}” is larger than {max}.',
    'document.error.read': '“{name}” could not be read as text.',
    'document.error.invalid': '“{name}” is not a valid document.',
  },
  items: [
    {
      id: 'readOnly',
      label: 'view.readOnly',
      icon: 'readOnly',
      in: ['document'],
      group: 'view',
      order: 30,
      command: 'toggleEditable',
      active: 'readOnly',
    },
    {
      id: 'openFile',
      label: 'document.open',
      icon: 'openFile',
      in: ['document'],
      group: 'file',
      order: 0,
      command: 'openFile',
    },
    ...(['json', 'html', 'markdown', 'text'] as const).map((format, i) => ({
      id: `export-${format}`,
      label: `document.export.${format}`,
      icon: 'download',
      in: ['document'] as const,
      group: 'export',
      order: i,
      command: 'downloadAs',
      args: [format],
      visible: (editor: TeiEditor) => format === 'json' || editor.formats.includes(format),
    })),
    {
      id: 'clearDocument',
      label: 'document.clear',
      icon: 'clearDocument',
      in: ['document'],
      group: 'clear',
      order: 0,
      variant: 'danger',
      command: 'clearDocument',
    },
  ],
});
