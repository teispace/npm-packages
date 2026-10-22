import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setExtensionOptions } from '../../src/core/define';
import type { TeiEditor } from '../../src/core/editor';
import { Blocks } from '../../src/extensions/blocks/index';
import { Callout } from '../../src/extensions/callout/index';
import { Card } from '../../src/extensions/card/index';
import { Clipboard } from '../../src/extensions/clipboard/index';
import { Collapsible } from '../../src/extensions/collapsible/index';
import { Columns } from '../../src/extensions/columns/index';
import { Embed, type EmbedOptions } from '../../src/extensions/embed/index';
import { FileAttachment, type FileOptions } from '../../src/extensions/file/index';
import { Html } from '../../src/extensions/html/index';
import { Image, type ImageOptions } from '../../src/extensions/image/index';
import { PageBreak } from '../../src/extensions/page-break/index';
import { PullQuote } from '../../src/extensions/pull-quote/index';
import { StarterKit } from '../../src/extensions/starter-kit/index';
import { StickyNote } from '../../src/extensions/sticky-note/index';
import { Table } from '../../src/extensions/table/index';
import { TextStyle } from '../../src/extensions/text-style/index';
import {
  Button,
  ColorPicker,
  Dialog,
  DropdownMenu,
  Editor,
  Field,
  GridPicker,
  Input,
  type MenuGroupData,
  useTeiEditor,
} from '../../src/react/index';
import { neutralizeAttributes, restoreStyles } from '../../src/utils/html-attributes';

declare global {
  interface Window {
    __tei: {
      editor: TeiEditor;
      violations: string[];
      log: string[];
      setClipSource: (html: string, raw?: boolean) => void;
      trust: (html: string) => string;
      /** Change the Image extension's options (an upload handler, limits). */
      setImageOptions: (options: Partial<ImageOptions>) => void;
      /** Change the FileAttachment extension's options. */
      setFileOptions: (options: Partial<FileOptions>) => void;
      /** Change the Embed extension's options. */
      setEmbedOptions: (options: Partial<EmbedOptions>) => void;
      /** What the clipboard reads as for the menu's Paste; `null` as if the browser refused. */
      setClipboard: (data: { html?: string; text?: string } | null) => void;
    };
  }
}

const violations: string[] = [];
document.addEventListener('securitypolicyviolation', (event) => {
  violations.push(
    `${event.violatedDirective} ${event.blockedURI} ${event.sample} at ${event.sourceFile}:${event.lineNumber}`,
  );
});
const log: string[] = [];

// Tests copy from here and paste into the editor: a real clipboard round trip.
const e2ePolicy = (
  window as {
    trustedTypes?: {
      createPolicy(
        name: string,
        rules: { createHTML(s: string): string },
      ): {
        createHTML(s: string): unknown;
      };
    };
  }
).trustedTypes?.createPolicy('e2e', { createHTML: (html) => html });
const trust = (html: string) => (e2ePolicy ? e2ePolicy.createHTML(html) : html) as string;
/** `raw` keeps handlers in the source, for tests of hostile clipboards. */
function setClipSource(html: string, raw = false) {
  const source = document.getElementById('clip-source') as HTMLElement;
  // A strict style-src blocks the markup's styles (Firefox drops their text
  // too); apply them through the CSSOM, as the editor's own import does.
  source.innerHTML = trust(raw ? html : neutralizeAttributes(html));
  restoreStyles(source);
  const selection = getSelection();
  selection?.selectAllChildren(source);
}

const params = new URLSearchParams(location.search);

const GROUPS: MenuGroupData[] = [
  {
    id: 'basic',
    label: 'Basic',
    items: [
      { id: 'one', label: 'One', icon: 'bold', shortcut: '⌘B', onSelect: () => log.push('one') },
      {
        id: 'two',
        label: 'Two',
        description: 'With a description',
        onSelect: () => log.push('two'),
      },
      { id: 'off', label: 'Disabled', disabled: true },
      {
        id: 'more',
        label: 'More',
        items: [
          { id: 'sub-a', label: 'Sub A', onSelect: () => log.push('sub-a') },
          { id: 'sub-b', label: 'Sub B', onSelect: () => log.push('sub-b') },
        ],
      },
    ],
  },
  {
    id: 'danger',
    items: [
      { id: 'delete', label: 'Delete', variant: 'danger', onSelect: () => log.push('delete') },
    ],
  },
];

const SWATCHES = [
  { value: '#e03131', label: 'Red' },
  { value: '#2f9e44', label: 'Green' },
  { value: '#1971c2', label: 'Blue' },
  { value: '#f08c00', label: 'Orange' },
];

function App() {
  const editor = useTeiEditor({
    extensions: [
      StarterKit,
      // `plain`: no text styles, for a toolbar that fits the frame.
      ...(params.has('plain') ? [] : [TextStyle]),
      ...(params.has('raw') ? [Html.configure({ clean: false })] : []),
      ...(params.has('table') ? [Table] : []),
      ...(params.has('image') ? [Image] : []),
      ...(params.has('file') ? [FileAttachment] : []),
      ...(params.has('embed') ? [Embed] : []),
      ...(params.has('blocks') ? [Blocks] : []),
      // The document's own blocks: pull quotes, callouts, sections, page breaks.
      ...(params.has('extras') ? [PullQuote, Callout, Collapsible, PageBreak] : []),
      ...(params.has('cards') ? [Card, StickyNote] : []),
      ...(params.has('columns') ? [Columns] : []),
    ],
    content: params.get('content') ?? '<p>Hello world</p>',
  });
  const [dialog, setDialog] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  window.__tei = {
    editor,
    violations,
    log,
    setClipSource,
    trust,
    setImageOptions: (options) => setExtensionOptions(editor, Image, options),
    setFileOptions: (options) => setExtensionOptions(editor, FileAttachment, options),
    setEmbedOptions: (options) => setExtensionOptions(editor, Embed, options),
    setClipboard: (data) =>
      setExtensionOptions(editor, Clipboard, {
        read: async (plain) => {
          if (!data) return null;
          const transfer = new DataTransfer();
          if (data.text) transfer.setData('text/plain', data.text);
          if (data.html && !plain) transfer.setData('text/html', data.html);
          return transfer;
        },
      }),
  };
  return (
    <main data-testid="root">
      <Editor
        editor={editor}
        placeholder="Write something…"
        toolbarOverflow={params.has('scroll') ? 'scroll' : params.has('wrap') ? 'wrap' : undefined}
        frameProps={{ 'data-testid': 'editor', dir: params.has('rtl') ? 'rtl' : undefined }}
        slots={{
          ...(params.has('nocontext') ? { contextMenu: false } : {}),
          ...(params.has('nosticky') ? { stickyMenu: false } : {}),
        }}
        contentProps={{ 'data-testid': 'content' }}
      />
      {/* UI outside an editor takes the tokens from .tei-portal. */}
      <section className="tei-portal gallery" data-testid="gallery">
        <DropdownMenu label="Menu" groups={GROUPS} data-testid="menu-trigger">
          Menu
        </DropdownMenu>
        <DropdownMenu
          label="Colour"
          data-testid="color-trigger"
          content={(close) => (
            <ColorPicker
              value={color}
              swatches={SWATCHES}
              onChange={(value) => {
                setColor(value);
                close();
              }}
            />
          )}
        >
          Colour {color ?? 'none'}
        </DropdownMenu>
        <DropdownMenu
          label="Table"
          data-testid="grid-trigger"
          content={(close) => (
            <GridPicker
              onPick={(rows, columns) => {
                log.push(`grid ${rows}x${columns}`);
                close();
              }}
            />
          )}
        >
          Table
        </DropdownMenu>
        <Button variant="outline" data-testid="dialog-trigger" onClick={() => setDialog(true)}>
          Open dialog
        </Button>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Insert link"
          description="Paste or type a URL."
          onSubmit={() => {
            log.push('dialog submit');
            setDialog(false);
          }}
          footer={
            <Button variant="solid" type="submit" data-testid="dialog-submit">
              Insert
            </Button>
          }
        >
          <Field label="URL">
            {(field) => <Input {...field} data-testid="dialog-input" placeholder="https://" />}
          </Field>
        </Dialog>
      </section>
      <div className="tei-portal corner">
        <DropdownMenu label="Corner" groups={GROUPS} data-testid="corner-trigger">
          Corner
        </DropdownMenu>
      </div>
      <div id="clip-source" data-testid="clip-source" />
      {params.has('tall') ? <div className="tall" /> : null}
    </main>
  );
}

createRoot(document.getElementById('app') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
