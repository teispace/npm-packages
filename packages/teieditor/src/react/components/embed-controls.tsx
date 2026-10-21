'use client';

import { COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND, type NodeKey } from 'lexical';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { getExtensionOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  $getEmbed,
  Embed,
  type EmbedStorage,
  type EmbedSuggestion,
  matchEmbed,
} from '../../extensions/embed/index.js';
import { TeiEditorContext, useOptionalEditor } from '../context.js';
import { selectionAnchor } from '../selection-anchor.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/controls.js';
import type { FloatingAnchor } from '../ui/floating.js';
import { Popover } from '../ui/popover.js';
import { useEditorFocus } from '../use-editor-focus.js';
import { useEditorState } from '../use-editor-state.js';
import { useUiRequest } from '../use-ui-request.js';
import type { ToolbarControl } from './editor-toolbar.js';
import { NodeToolbar } from './node-toolbar.js';

const storageOf = (editor: TeiEditor) =>
  editor.extension(Embed)?.output.storage as EmbedStorage | undefined;

/** A signal's value, kept in step. */
function useSignal<T>(
  signal: { peek(): T; subscribe(fn: (value: T) => void): () => void } | undefined,
) {
  const [value, setValue] = useState(() => signal?.peek());
  useEffect(() => signal?.subscribe(setValue), [signal]);
  return value;
}

// -- Inserting ----------------------------------------------------------------

/**
 * A field for the link to embed, for one provider (`provider`) or any.
 * It names what a link will embed as it is typed, and which sites it can
 * embed when one cannot be.
 */
export function InsertEmbedForm({
  editor,
  provider,
  onDone,
}: {
  editor: TeiEditor;
  provider?: string | null;
  onDone: () => void;
}) {
  const [url, setUrl] = useState('');
  const [invalid, setInvalid] = useState(false);
  const hintId = useId();
  const providers = getExtensionOptions(editor, Embed)?.providers ?? [];
  const asked = providers.find((p) => p.name === provider);
  const found = url.trim() ? matchEmbed(asked ? [asked] : providers, url) : null;
  const sites = useMemo(() => {
    // The page's language where the editor sits, else the browser's.
    const lang = editor.lexical.getRootElement()?.closest<HTMLElement>('[lang]')?.lang || undefined;
    return new Intl.ListFormat(lang, { type: 'disjunction' }).format(
      (asked ? [asked] : providers).map((p) => p.label),
    );
  }, [editor, asked, providers]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const link = url.trim();
    if (!link) return;
    if (!found || !editor.can().insertEmbed(link)) {
      setInvalid(true);
      return;
    }
    onDone();
    editor.chain().focus().insertEmbed(link).run();
  };

  return (
    <div className="tei-embed-insert" data-tei-control="embed-insert">
      <form className="tei-link-form" noValidate onSubmit={submit}>
        <Input
          type="url"
          inputMode="url"
          value={url}
          placeholder={
            asked
              ? editor.t('embed.url.placeholder.provider', { title: asked.title })
              : editor.t('embed.url.placeholder')
          }
          aria-label={editor.t('embed.url.placeholder')}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          data-tei-control="embed-url"
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
        />
        <Button type="submit" variant="solid" size="sm" disabled={!url.trim()}>
          {editor.t('embed.submit')}
        </Button>
      </form>
      <p
        id={hintId}
        className="tei-hint"
        data-error={invalid ? '' : undefined}
        role={invalid ? 'alert' : undefined}
      >
        {invalid
          ? `${editor.t('embed.url.invalid')}. ${editor.t('embed.url.supported', { providers: sites })}`
          : found
            ? found.provider.title
            : editor.t('embed.url.supported', { providers: sites })}
      </p>
    </div>
  );
}

/** The form at the caret, opened by `openEmbedInsert` (the toolbar's Embed, the slash menu's). */
export function EmbedInsertPopover({ editor }: { editor: TeiEditor }) {
  const storage = storageOf(editor);
  const [open, setOpen] = useState<{ anchor: FloatingAnchor; provider: string | null } | null>(
    null,
  );
  useUiRequest(storage?.insert, () =>
    setOpen({
      anchor: selectionAnchor(editor) ?? (editor.lexical.getRootElement() as HTMLElement),
      provider: storage?.insertProvider.peek() ?? null,
    }),
  );
  if (!open) return null;
  const close = () => setOpen(null);
  return (
    <Popover
      open
      anchor={open.anchor}
      placement="bottom-start"
      initialFocus="first"
      restoreFocus={false}
      onDismiss={(reason) => {
        close();
        if (reason === 'escape') editor.focus();
      }}
      role="dialog"
      aria-label={editor.t('embed.insert')}
      data-tei-control="embed-insert-popover"
    >
      <InsertEmbedForm editor={editor} provider={open.provider} onDone={close} />
    </Popover>
  );
}

// -- A pasted link ------------------------------------------------------------

/**
 * The offer to embed a link pasted on its own (`autoEmbed: 'ask'`), under
 * the link. Enter takes it, Escape or typing on declines it; the caret
 * stays in the text throughout.
 */
export function EmbedSuggestionMenu({ editor }: { editor: TeiEditor }) {
  const storage = storageOf(editor);
  const offer = useSignal(storage?.suggestion) as EmbedSuggestion | null | undefined;
  const anchor = offer ? editor.lexical.getElementByKey(offer.key) : null;

  useEffect(() => {
    if (!offer) return;
    return editor.lexical.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) return false;
        event?.preventDefault();
        editor.commands.embedLink(offer.key);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, offer]);

  if (!offer || !anchor || !storage) return null;
  const dismiss = () => {
    storage.suggestion.value = null;
  };
  return (
    <Popover
      open
      anchor={anchor}
      placement="bottom-start"
      offset={6}
      variant="bar"
      onDismiss={dismiss}
      role="group"
      aria-label={editor.t('embed.suggest.label')}
      data-tei-control="embed-suggestion"
    >
      <Button
        size="sm"
        icon={offer.provider.icon ?? 'embed'}
        shortcut="Enter"
        data-tei-control="embed-suggestion-accept"
        onClick={() => editor.chain().focus().embedLink(offer.key).run()}
      >
        {editor.t('embed.suggest', { title: offer.provider.title })}
      </Button>
      <Button
        size="sm"
        shortcut="Escape"
        data-tei-control="embed-suggestion-dismiss"
        onClick={() => {
          dismiss();
          editor.focus();
        }}
      >
        {editor.t('embed.suggest.dismiss')}
      </Button>
    </Popover>
  );
}

// -- A selected embed ---------------------------------------------------------

interface Selected {
  key: NodeKey;
  url: string | null;
}

const same = (a: Selected | null, b: Selected | null) =>
  a === b || (a !== null && b !== null && a.key === b.key && a.url === b.url);

function useSelectedEmbed(editor: TeiEditor): Selected | null {
  return useEditorState(
    (e) =>
      e.read(() => {
        const node = $getEmbed();
        return node ? { key: node.getKey(), url: node.getURL() } : null;
      }),
    { editor, equal: same },
  );
}

/** Its page, in a new tab. */
function OpenControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedEmbed(editor);
  if (!selected) return null;
  return (
    <Button
      size="sm"
      icon="externalLink"
      label={editor.t('embed.open')}
      disabled={!selected.url}
      data-item="embedOpen"
      data-tei-control="embed-open"
      onClick={() => {
        if (!selected.url) return;
        const doc = editor.lexical.getRootElement()?.ownerDocument ?? document;
        const link = doc.createElement('a');
        link.href = selected.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }}
    />
  );
}

/** Its page's link, to the clipboard; the button says so for a moment. */
function CopyControl({ editor }: { editor: TeiEditor }) {
  const selected = useSelectedEmbed(editor);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!selected) return null;
  return (
    <Button
      size="sm"
      icon={copied ? 'check' : 'copy'}
      label={editor.t(copied ? 'embed.copied' : 'embed.copy')}
      disabled={!selected.url}
      data-item="embedCopy"
      data-tei-control="embed-copy"
      onClick={() => {
        if (!selected.url) return;
        const view = editor.lexical.getRootElement()?.ownerDocument.defaultView ?? window;
        void view.navigator.clipboard?.writeText(selected.url).then(() => setCopied(true));
      }}
    />
  );
}

const EMBED_CONTROLS: Record<string, ToolbarControl> = {
  embedOpen: OpenControl,
  embedCopy: CopyControl,
};

function EmbedToolbar({
  editor,
  controls,
}: {
  editor: TeiEditor;
  controls?: Record<string, ToolbarControl>;
}) {
  const focused = useEditorFocus(editor);
  const editable = useEditorState((e) => e.isEditable, { editor });
  const selected = useSelectedEmbed(editor);
  const named = useMemo(() => ({ ...EMBED_CONTROLS, ...controls }), [controls]);
  const box = selected && editor.lexical.getElementByKey(selected.key);
  const anchor = box?.querySelector('.tei-embed-frame') ?? box;
  if (!editable || !focused || !anchor) return null;
  return (
    <NodeToolbar
      editor={editor}
      anchor={anchor}
      placement="embedMenu"
      label={editor.t('embed.menu')}
      control="embed-toolbar"
      controls={named}
    />
  );
}

export interface EmbedControlsProps {
  /** The editor; defaults to the one from context. */
  editor?: TeiEditor;
  /** Controls the `embedMenu` items name, besides (or replacing) the built-in ones. */
  controls?: Record<string, ToolbarControl>;
  /** The form `openEmbedInsert` opens. Default true. */
  insert?: boolean;
  /** The offer to embed a pasted link. Default true. */
  suggest?: boolean;
}

/**
 * The embed UI: the form to paste a link (`openEmbedInsert`), the offer to
 * embed a link pasted on its own, and the toolbar over a selected embed
 * (align, open, copy, delete). Renders nothing without `Embed`.
 *
 * Render it once inside `<EditorContent>` (`<Editor>` does).
 */
export function EmbedControls({
  editor: editorProp,
  controls,
  insert = true,
  suggest = true,
}: EmbedControlsProps) {
  const contextEditor = useOptionalEditor();
  const editor = editorProp ?? contextEditor;
  if (!editor) throw new Error('teieditor: <EmbedControls> needs an `editor` prop or a provider');
  if (!editor.extension(Embed)) return null;
  return (
    <TeiEditorContext.Provider value={editor}>
      {insert && <EmbedInsertPopover editor={editor} />}
      {suggest && <EmbedSuggestionMenu editor={editor} />}
      <EmbedToolbar editor={editor} controls={controls} />
    </TeiEditorContext.Provider>
  );
}
