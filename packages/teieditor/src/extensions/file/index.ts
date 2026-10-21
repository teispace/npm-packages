import { configExtension } from '@lexical/extension';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import type { ElementTransformer } from '@lexical/markdown';
import { DRAG_DROP_PASTE } from '@lexical/rich-text';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $onUpdate,
  COMMAND_PRIORITY_NORMAL,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
} from 'lexical';
import { defineTeiExtension, getPeerOptions, type TeiExtensionContext } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  $canInsertBlock,
  $caretAfter,
  $insertBlockAtSelection,
  $liftBlock,
  $removeBlockHost,
  registerHostSelection,
  registerSelectedAttribute,
} from '../../core/slot-host.js';
import type { TeiItem } from '../../core/types.js';
import { download, file as fileIcon, pencil, replace, trash } from '../../icons/index.js';
import { acceptsFile, chooseFiles, readAsDataURL } from '../../utils/files.js';
import {
  registerUploads,
  startUpload,
  type Upload,
  type UploadProgress,
} from '../../utils/upload.js';
import { isSafeFileUrl } from '../../utils/url.js';
import { RichText } from '../rich-text/index.js';
import { $createFileNode, $isFileNode, FileNode } from './node.js';

export type { SerializedFileNode } from './node.js';
export { $createFileNode, $isFileNode, FileNode, fileKind, formatFileSize } from './node.js';

/** A file to attach. */
export interface FileData {
  src: string;
  name: string;
  /** In bytes. */
  size?: number | null;
  mimeType?: string;
}

export interface FileUploadContext extends UploadProgress {
  editor: TeiEditor;
}

/** A hosted file's URL, or that and what the server knows of it. */
export type FileUploadResult = string | { src: string; name?: string; size?: number };

export type FileUploadHandler = (
  file: File,
  context: FileUploadContext,
) => Promise<FileUploadResult>;

/** Why a file was not attached. */
export class FileUploadError extends Error {
  constructor(
    readonly code: 'size' | 'upload' | 'unsafe',
    readonly file: File,
    options?: { cause?: unknown },
  ) {
    super(
      code === 'size'
        ? `${file.name} is too large`
        : code === 'unsafe'
          ? `${file.name} came back with a URL that cannot be linked to`
          : `${file.name} could not be uploaded`,
      options,
    );
    this.name = 'FileUploadError';
  }
}

export interface FileOptions {
  /**
   * Uploads a file and resolves with its URL. Without one, files are kept
   * in the document as `data:` URLs, which suits small ones only. The file
   * shows at once, with its upload's progress.
   */
  upload: FileUploadHandler | null;
  /**
   * Files that are attached, as `<input accept>` reads them. Default: any.
   * Images go to the Image extension instead, when it is installed.
   */
  accept: string;
  /** The largest file accepted, in bytes. Default 25 MB. */
  maxFileSize: number;
  /** A file was refused or its upload failed; it is taken out again. */
  onUploadError: ((error: FileUploadError) => void) | null;
}

declare module '@teispace/teieditor' {
  interface TeiCommands {
    /** Choose files to attach, with the browser's file chooser. Call it from a click. */
    openFileInsert: [];
    /** Attach a file that is already hosted, where the caret is. */
    insertFile: [file: FileData];
    /** Attach each file and upload it, through the `upload` option. */
    insertFiles: [files: readonly File[]];
    /** Rename the selected file (or the one with `key`): the name it downloads as. */
    renameFile: [name: string, key?: NodeKey];
    /** Upload a file in place of the selected one (or the one with `key`). */
    replaceFile: [file: File, key?: NodeKey];
    removeFile: [key?: NodeKey];
  }
  interface TeiActiveStates {
    /** A file is selected. */
    file: [];
  }
}

export interface FileStorage {
  /** Uploads in flight, by the key of their file. */
  uploads: Map<NodeKey, Upload>;
}

type Ctx = TeiExtensionContext<FileOptions, FileStorage> & {
  editor: TeiEditor;
  lexical: LexicalEditor;
};

/** The file with this key, else the selected one. */
export function $getFile(key?: NodeKey): FileNode | null {
  if (key !== undefined) {
    const node = $getNodeByKey(key);
    return $isFileNode(node) ? node : null;
  }
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  return nodes.length === 1 && $isFileNode(nodes[0]) ? nodes[0] : null;
}

const $hasFile = () => $getFile() !== null;

/** Images are the Image extension's, when it is there. */
function isImageFile(lexical: LexicalEditor, file: File): boolean {
  const image = getPeerOptions<{ accept: string }>(lexical, '@teispace/teieditor/image');
  return image !== undefined && acceptsFile(file, image.accept);
}

/**
 * The files to attach, and an error for each that is too large. Dropped or
 * pasted images are left to the Image extension (`images: false`); a file
 * chosen to attach is attached, whatever it is.
 */
function sortFiles(ctx: Ctx, files: readonly File[], images = true): File[] {
  return files.filter((file) => {
    if (!images && isImageFile(ctx.lexical, file)) return false;
    if (!acceptsFile(file, ctx.options.accept)) return false;
    if (file.size <= ctx.options.maxFileSize) return true;
    ctx.options.onUploadError?.(new FileUploadError('size', file));
    return false;
  });
}

function uploadFile(ctx: Ctx, key: NodeKey, file: File): void {
  const { options, editor } = ctx;
  const handler: FileUploadHandler =
    options.upload ?? ((f, { onProgress, signal }) => readAsDataURL(f, { onProgress, signal }));
  startUpload({
    lexical: ctx.lexical,
    uploads: ctx.storage.uploads,
    key,
    preview: null,
    run: (progress) => handler(file, { ...progress, editor }),
    valid: (result) => {
      const src = typeof result === 'string' ? result : result?.src;
      return typeof src === 'string' && isSafeFileUrl(src);
    },
    $apply: (node, result) => {
      if (!$isFileNode(node)) return;
      const data = typeof result === 'string' ? { src: result } : result;
      node.setSrc(data.src);
      if (data.name) node.setName(data.name);
      if (data.size !== undefined) node.setSize(data.size);
    },
    onError: (code, cause) => options.onUploadError?.(new FileUploadError(code, file, { cause })),
  });
}

/** A file node for each file, uploading; the caret goes after the last. */
function $attach(ctx: Ctx, files: readonly File[]): boolean {
  let last: LexicalNode | null = null;
  for (const file of files) {
    const node = $createFileNode({
      src: '',
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });
    if (last) last.insertAfter(node);
    else $insertBlockAtSelection(node);
    last = node;
    const key = node.getKey();
    $onUpdate(() => uploadFile(ctx, key, file));
  }
  if (!last) return false;
  $caretAfter(last);
  return true;
}

// -- HTML and Markdown --------------------------------------------------------

/** `<a download data-tei-file>`, as a file saves. */
const FILE_RULE = defineImportRule({
  name: '@teispace/teieditor/file/a',
  match: sel.tag('a'),
  $import: (_ctx, el, $next) => {
    if (!el.hasAttribute('data-tei-file')) return $next();
    const src = el.getAttribute('href')?.trim() ?? '';
    if (!isSafeFileUrl(src)) return $next();
    const bytes = Number.parseInt(el.getAttribute('data-size') ?? '', 10);
    return [
      $createFileNode({
        src,
        name: el.getAttribute('download') || el.textContent?.trim() || '',
        size: Number.isFinite(bytes) ? bytes : null,
        mimeType: el.getAttribute('type') ?? '',
      }),
    ];
  },
});

/** Out as a link, `[name](src)`; Markdown has no files, so it comes back one. */
export const FILE: ElementTransformer = {
  dependencies: [FileNode],
  export: (node) => {
    if (!$isFileNode(node)) return null;
    const name = node.getName().replace(/[\\[\]]/g, '\\$&');
    return `[${name}](${node.getSrc().replace(/[\s()<>]/g, encodeURIComponent)})`;
  },
  regExp: /(?!)/,
  replace: () => false,
  type: 'element',
};

// -- Extension ----------------------------------------------------------------

const fileItem = (item: Omit<TeiItem, 'in'>): TeiItem => ({ in: ['fileMenu'], ...item });

/**
 * File attachments: chosen, dropped or pasted (anything the Image extension
 * does not take), uploaded with progress, shown as a card with the file's
 * kind, name and size that downloads it. Rename and replace from the
 * toolbar over a selected file. Saved as `<a download data-tei-file>`.
 *
 * In React, `<Editor>` adds the toolbar over a selected file.
 */
export const FileAttachment = defineTeiExtension({
  name: '@teispace/teieditor/file',
  config: {
    upload: null,
    accept: '',
    maxFileSize: 25 * 1024 * 1024,
    onUploadError: null,
  } as FileOptions,
  nodes: [FileNode],
  dependencies: [RichText, configExtension(DOMImportExtension, { rules: [FILE_RULE] })],
  storage: (): FileStorage => ({ uploads: new Map() }),
  markdown: { file: FILE },
  register: (ctx) => {
    const { lexical, storage } = ctx;
    return mergeRegister(
      registerHostSelection(lexical, $isFileNode),
      registerSelectedAttribute(lexical, $isFileNode),
      lexical.registerNodeTransform(FileNode, $liftBlock),
      registerUploads(lexical, storage.uploads, [FileNode]),
      // Before the Image extension: attach what it does not take, and leave
      // it the images, which then go after the files.
      lexical.registerCommand(
        DRAG_DROP_PASTE,
        (files) => {
          const mine = sortFiles(ctx, files, false);
          if (mine.length === 0) return false;
          $attach(ctx, mine);
          return !files.some((file) => isImageFile(lexical, file));
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    );
  },
  commands: {
    openFileInsert: {
      run: ({ options, editor, lexical }) => {
        if (!$canInsertBlock()) return false;
        const doc = lexical.getRootElement()?.ownerDocument;
        if (!doc) return false;
        void chooseFiles(doc, { accept: options.accept || undefined, multiple: true }).then(
          (files) => {
            if (files.length > 0) editor.chain().focus().insertFiles(files).run();
          },
        );
      },
      can: $canInsertBlock,
    },
    insertFile: {
      run: (_ctx, data: FileData) => {
        if (!data || typeof data.src !== 'string' || !isSafeFileUrl(data.src.trim())) return false;
        if (!$canInsertBlock()) return false;
        const node = $insertBlockAtSelection($createFileNode({ ...data, src: data.src.trim() }));
        $caretAfter(node);
      },
      can: (_ctx, data?: FileData) =>
        $canInsertBlock() && (data === undefined || isSafeFileUrl(String(data.src).trim())),
    },
    insertFiles: {
      run: (ctx, files: readonly File[]) => {
        if (!$canInsertBlock()) return false;
        const mine = sortFiles(ctx as Ctx, files);
        return mine.length > 0 && $attach(ctx as Ctx, mine);
      },
      can: $canInsertBlock,
    },
    renameFile: {
      run: (_ctx, name: string, key?: NodeKey) => {
        const node = $getFile(key);
        if (!node || typeof name !== 'string' || !name.trim()) return false;
        node.setName(name);
      },
      can: $hasFile,
    },
    replaceFile: {
      run: (ctx, file: File, key?: NodeKey) => {
        const node = $getFile(key);
        if (!node || !file) return false;
        if (!acceptsFile(file, ctx.options.accept)) return false;
        if (file.size > ctx.options.maxFileSize) {
          ctx.options.onUploadError?.(new FileUploadError('size', file));
          return false;
        }
        node.setSrc('').setName(file.name).setSize(file.size).setMimeType(file.type);
        const nodeKey = node.getKey();
        $onUpdate(() => uploadFile(ctx as Ctx, nodeKey, file));
      },
      can: $hasFile,
    },
    removeFile: {
      run: (_ctx, key?: NodeKey) => {
        const node = $getFile(key);
        if (!node) return false;
        $removeBlockHost(node);
      },
      can: $hasFile,
    },
  },
  active: { file: $hasFile },
  icons: { file: fileIcon, download, pencil, replace, trash },
  messages: {
    'file.insert': 'File',
    'file.insert.description': 'Attach a file to download',
    'file.menu': 'File',
    'file.download': 'Download',
    'file.rename': 'Rename',
    'file.rename.placeholder': 'File name',
    'file.save': 'Save',
    'file.replace': 'Replace',
    'file.remove': 'Delete file',
    'file.uploading': 'Uploading…',
  },
  items: [
    {
      id: 'insertFile',
      label: 'file.insert',
      description: 'file.insert.description',
      icon: 'file',
      in: ['toolbar', 'slash', 'insert'],
      group: 'insert',
      order: 20,
      keywords: ['file', 'attachment', 'attach', 'upload', 'pdf', 'document', 'download'],
      command: 'openFileInsert',
    },
    fileItem({
      id: 'fileDownload',
      label: 'file.download',
      icon: 'download',
      group: 'file',
      order: 0,
      control: 'fileDownload',
    }),
    fileItem({
      id: 'fileRename',
      label: 'file.rename',
      icon: 'pencil',
      group: 'file',
      order: 1,
      control: 'fileRename',
    }),
    fileItem({
      id: 'fileReplace',
      label: 'file.replace',
      icon: 'replace',
      group: 'file',
      order: 2,
      control: 'fileReplace',
    }),
    fileItem({
      id: 'removeFile',
      variant: 'danger',
      label: 'file.remove',
      icon: 'trash',
      group: 'remove',
      order: 0,
      command: 'removeFile',
    }),
  ],
});
