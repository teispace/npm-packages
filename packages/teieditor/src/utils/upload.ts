import {
  $getNodeByKey,
  HISTORY_MERGE_TAG,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
} from 'lexical';

/** An upload in flight, by the key of the node it is for. */
export interface Upload {
  controller: AbortController;
  /** The `blob:` URL the node shows until the upload is done, if any. */
  preview: string | null;
  progress: number;
}

/** What an upload handler gets besides the file. */
export interface UploadProgress {
  /** Report progress, 0 to 1; the node shows it while it uploads. */
  onProgress: (fraction: number) => void;
  /** Aborts when the node is removed before its upload finishes. */
  signal: AbortSignal;
}

/** The upload's state on the node's DOM, for CSS: no document change, nothing to undo. */
export function paintUpload(lexical: LexicalEditor, key: NodeKey, upload?: Upload): void {
  const dom = lexical.getElementByKey(key);
  if (!dom) return;
  if (upload) {
    dom.setAttribute('data-tei-uploading', '');
    dom.style.setProperty('--tei-progress', String(upload.progress));
  } else {
    dom.removeAttribute('data-tei-uploading');
    dom.style.removeProperty('--tei-progress');
  }
}

/** Stop the upload for `key`, if any, and let its preview go. */
export function dropUpload(uploads: Map<NodeKey, Upload>, key: NodeKey): void {
  const upload = uploads.get(key);
  if (!upload) return;
  upload.controller.abort();
  uploads.delete(key);
  if (upload.preview) URL.revokeObjectURL(upload.preview);
}

/**
 * Upload for the node with `key`: progress painted on its DOM, the result
 * put on it (not an undo step), and the node taken out if it fails. A
 * result for an upload that is no longer the node's (removed, replaced)
 * is dropped.
 */
export function startUpload<R>(options: {
  lexical: LexicalEditor;
  uploads: Map<NodeKey, Upload>;
  key: NodeKey;
  preview: string | null;
  run: (progress: UploadProgress) => Promise<R>;
  /** Whether the result can go on the node: a safe URL. */
  valid: (result: R) => boolean;
  /** Put the result on the node, in an update. */
  $apply: (node: LexicalNode, result: R) => void;
  onError: (code: 'upload' | 'unsafe', cause?: unknown) => void;
}): void {
  const { lexical, uploads, key, preview } = options;
  const upload: Upload = { controller: new AbortController(), preview, progress: 0 };
  uploads.get(key)?.controller.abort();
  uploads.set(key, upload);
  paintUpload(lexical, key, upload);

  const done = (): boolean => {
    const current = uploads.get(key) === upload;
    if (current) uploads.delete(key);
    paintUpload(lexical, key);
    return current;
  };
  const revoke = () => {
    if (preview) URL.revokeObjectURL(preview);
  };
  const fail = (code: 'upload' | 'unsafe', cause?: unknown) => {
    if (!done()) return;
    lexical.update(() => $getNodeByKey(key)?.remove(), { tag: HISTORY_MERGE_TAG });
    revoke();
    options.onError(code, cause);
  };
  options
    .run({
      signal: upload.controller.signal,
      onProgress: (fraction) => {
        if (uploads.get(key) !== upload || !Number.isFinite(fraction)) return;
        upload.progress = Math.min(1, Math.max(0, fraction));
        paintUpload(lexical, key, upload);
      },
    })
    .then(
      (result) => {
        if (!options.valid(result)) {
          fail('unsafe');
          return;
        }
        if (!done()) return;
        lexical.update(
          () => {
            const node = $getNodeByKey(key);
            if (node) options.$apply(node, result);
          },
          { tag: HISTORY_MERGE_TAG, onUpdate: revoke },
        );
      },
      (cause) => fail('upload', cause),
    );
}

/**
 * Uploads follow their nodes: repainted when a node's DOM is redrawn,
 * aborted when it is deleted, and all aborted when the editor goes.
 */
export function registerUploads(
  lexical: LexicalEditor,
  uploads: Map<NodeKey, Upload>,
  klasses: readonly Klass<LexicalNode>[],
): () => void {
  return mergeRegister(
    ...klasses.map((klass) =>
      lexical.registerMutationListener(klass, (mutations) => {
        for (const [key, kind] of mutations) {
          const upload = uploads.get(key);
          if (!upload) continue;
          if (kind === 'destroyed') dropUpload(uploads, key);
          else paintUpload(lexical, key, upload);
        }
      }),
    ),
    () => {
      for (const key of [...uploads.keys()]) dropUpload(uploads, key);
    },
  );
}
