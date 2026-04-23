'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { INSERT_CALLOUT_COMMAND } from '@teispace/teieditor/extensions/callout';
import { INSERT_EMBED_COMMAND } from '@teispace/teieditor/extensions/embed';
import { INSERT_IMAGE_COMMAND } from '@teispace/teieditor/extensions/image';
import { INSERT_MATH_COMMAND } from '@teispace/teieditor/extensions/math';
import { INSERT_TABLE_COMMAND } from '@teispace/teieditor/extensions/table';
import { INSERT_TOGGLE_COMMAND } from '@teispace/teieditor/extensions/toggle';
import type { LexicalCommand } from 'lexical';
import { useCallback, useState } from 'react';
import { TeiButton } from '../../ui/button';
import { Dropdown, DropdownGroup, DropdownItem } from '../../ui/dropdown';
import {
  IconCallout,
  IconDivider,
  IconImage,
  IconMath,
  IconPlus,
  IconTable,
  IconToggle,
  IconVideo,
} from '../../ui/icons';
import { TeiInput } from '../../ui/input';
import { Modal } from '../../ui/modal';

// ---------------------------------------------------------------------------
// Insert Dialogs
// ---------------------------------------------------------------------------

function InsertImageDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (data: { src: string; altText: string; caption?: string }) => void;
}) {
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [pendingFile, setPendingFile] = useState<{ src: string; fileName: string } | null>(null);

  const handleFileSelect = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setPendingFile({ src: reader.result as string, fileName: file.name });
        if (!altText) setAltText(file.name.replace(/\.[^.]+$/, ''));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [altText]);

  const handleInsert = useCallback(() => {
    if (mode === 'file' && pendingFile) {
      onInsert({
        src: pendingFile.src,
        altText: altText || pendingFile.fileName,
        caption: caption || undefined,
      });
      onClose();
    } else if (mode === 'url' && url.trim()) {
      onInsert({
        src: url.trim(),
        altText: altText || 'Image',
        caption: caption || undefined,
      });
      onClose();
    }
  }, [mode, pendingFile, url, altText, caption, onInsert, onClose]);

  const canInsert = mode === 'file' ? pendingFile !== null : url.trim().length > 0;

  return (
    <Modal title="Insert Image" onClose={onClose}>
      <div className="flex gap-2 mb-4">
        <TeiButton
          onClick={() => setMode('file')}
          variant={mode === 'file' ? 'default' : 'ghost'}
          size="sm"
        >
          Upload
        </TeiButton>
        <TeiButton
          onClick={() => setMode('url')}
          variant={mode === 'url' ? 'default' : 'ghost'}
          size="sm"
        >
          URL
        </TeiButton>
      </div>

      <div className="flex flex-col gap-3">
        {mode === 'file' ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[hsl(var(--tei-border))] py-6">
            {pendingFile ? (
              <>
                <img
                  src={pendingFile.src}
                  alt={altText || pendingFile.fileName}
                  className="max-h-32 rounded-md"
                />
                <p className="text-xs text-[hsl(var(--tei-muted-fg))]">{pendingFile.fileName}</p>
                <TeiButton onClick={handleFileSelect} variant="ghost" size="sm">
                  Choose different file
                </TeiButton>
              </>
            ) : (
              <>
                <TeiButton onClick={handleFileSelect} variant="default">
                  Choose Image File
                </TeiButton>
                <p className="text-xs text-[hsl(var(--tei-muted-fg))]">PNG, JPG, GIF, WebP, SVG</p>
              </>
            )}
          </div>
        ) : (
          <TeiInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/image.png"
            label="Image URL"
            autoFocus
          />
        )}

        <TeiInput
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          placeholder="Description of the image (for screen readers)"
          label="Alt text"
        />
        <TeiInput
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Optional caption below the image"
          label="Caption"
        />

        <div className="flex justify-end gap-2 mt-2">
          <TeiButton onClick={onClose} variant="ghost" size="sm">
            Cancel
          </TeiButton>
          <TeiButton onClick={handleInsert} variant="default" size="sm" disabled={!canInsert}>
            Insert
          </TeiButton>
        </div>
      </div>
    </Modal>
  );
}

function InsertTableDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (data: { rows: number; columns: number; includeHeaders: boolean }) => void;
}) {
  const [rows, setRows] = useState('4');
  const [columns, setColumns] = useState('4');
  const [includeHeaders, setIncludeHeaders] = useState(true);

  return (
    <Modal title="Insert Table" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <TeiInput
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            type="number"
            label="Rows"
            className="w-24"
          />
          <TeiInput
            value={columns}
            onChange={(e) => setColumns(e.target.value)}
            type="number"
            label="Columns"
            className="w-24"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[hsl(var(--tei-fg))]">
          <input
            type="checkbox"
            checked={includeHeaders}
            onChange={(e) => setIncludeHeaders(e.target.checked)}
            className="rounded"
          />
          Include header row
        </label>
        <div className="flex justify-end gap-2 mt-2">
          <TeiButton onClick={onClose} variant="ghost" size="sm">
            Cancel
          </TeiButton>
          <TeiButton
            onClick={() => {
              onInsert({
                rows: Math.max(1, parseInt(rows) || 3),
                columns: Math.max(1, parseInt(columns) || 3),
                includeHeaders,
              });
              onClose();
            }}
            variant="default"
            size="sm"
          >
            Insert
          </TeiButton>
        </div>
      </div>
    </Modal>
  );
}

function InsertEmbedDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (url: string) => void;
}) {
  const [url, setUrl] = useState('');

  return (
    <Modal title="Insert Embed" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <TeiInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          label="URL (YouTube, Twitter, Figma, etc.)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && url.trim()) {
              onInsert(url.trim());
              onClose();
            }
          }}
        />
        <p className="text-xs text-[hsl(var(--tei-muted-fg))]">
          Supports YouTube, Twitter/X, Figma, and other embeddable URLs.
        </p>
        <div className="flex justify-end gap-2 mt-2">
          <TeiButton onClick={onClose} variant="ghost" size="sm">
            Cancel
          </TeiButton>
          <TeiButton
            onClick={() => {
              if (url.trim()) {
                onInsert(url.trim());
                onClose();
              }
            }}
            variant="default"
            size="sm"
            disabled={!url.trim()}
          >
            Embed
          </TeiButton>
        </div>
      </div>
    </Modal>
  );
}

function InsertMathDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (payload: { expression: string; inline: boolean }) => void;
}) {
  const [expression, setExpression] = useState('');
  const [inline, setInline] = useState(false);

  const submit = () => {
    if (!expression.trim()) return;
    onInsert({ expression: expression.trim(), inline });
    onClose();
  };

  return (
    <Modal title="Insert math (LaTeX)" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <TeiInput
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="e = mc^2"
          label="Expression"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          autoFocus
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inline}
            onChange={(e) => setInline(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--tei-fg))]"
          />
          Inline (default is block)
        </label>
        <p className="text-xs text-[hsl(var(--tei-muted-fg))]">
          Uses KaTeX. Install <code className="rounded bg-[hsl(var(--tei-muted))] px-1">katex</code>{' '}
          in your app to render.
        </p>
        <div className="flex justify-end gap-2 mt-2">
          <TeiButton onClick={onClose} variant="ghost" size="sm">
            Cancel
          </TeiButton>
          <TeiButton onClick={submit} variant="default" size="sm" disabled={!expression.trim()}>
            Insert
          </TeiButton>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// InsertDropdown
// ---------------------------------------------------------------------------

type DialogType = 'image' | 'table' | 'embed' | 'math' | null;

/**
 * Insert dropdown with proper modal dialogs for rich content insertion.
 */
export function InsertDropdown() {
  const [editor] = useLexicalComposerContext();
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);

  // Clicking a toolbar button (or opening a dialog) blurs the editor. All the
  // insert plugins bail if there's no RangeSelection, so `focus()` first to
  // restore the last-known selection before dispatching.
  const dispatch = useCallback(
    <T,>(command: LexicalCommand<T>, payload: T) => {
      editor.focus();
      editor.dispatchCommand(command, payload);
    },
    [editor],
  );

  return (
    <>
      <Dropdown
        trigger={
          <span className="flex items-center gap-1 px-1">
            <IconPlus size={14} />
            <span className="hidden text-xs sm:inline">Insert</span>
          </span>
        }
        triggerClassName="h-8 px-1.5"
      >
        <DropdownGroup label="Media">
          <DropdownItem onClick={() => setActiveDialog('image')} icon={<IconImage size={14} />}>
            Image
          </DropdownItem>
          <DropdownItem onClick={() => setActiveDialog('table')} icon={<IconTable size={14} />}>
            Table
          </DropdownItem>
          <DropdownItem onClick={() => setActiveDialog('embed')} icon={<IconVideo size={14} />}>
            Embed (YouTube, Twitter...)
          </DropdownItem>
        </DropdownGroup>

        <DropdownGroup label="Blocks">
          <DropdownItem
            onClick={() => dispatch(INSERT_CALLOUT_COMMAND, 'info')}
            icon={<IconCallout size={14} />}
          >
            Callout
          </DropdownItem>
          <DropdownItem
            onClick={() => dispatch(INSERT_TOGGLE_COMMAND, 'Toggle')}
            icon={<IconToggle size={14} />}
          >
            Collapsible
          </DropdownItem>
          <DropdownItem onClick={() => setActiveDialog('math')} icon={<IconMath size={14} />}>
            Math (LaTeX)
          </DropdownItem>
          <DropdownItem
            onClick={() => dispatch(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
            icon={<IconDivider size={14} />}
          >
            Horizontal Rule
          </DropdownItem>
        </DropdownGroup>
      </Dropdown>

      {/* Dialogs */}
      {activeDialog === 'image' && (
        <InsertImageDialog
          onClose={() => setActiveDialog(null)}
          onInsert={(data) => dispatch(INSERT_IMAGE_COMMAND, data)}
        />
      )}
      {activeDialog === 'table' && (
        <InsertTableDialog
          onClose={() => setActiveDialog(null)}
          onInsert={(data) => dispatch(INSERT_TABLE_COMMAND, data)}
        />
      )}
      {activeDialog === 'embed' && (
        <InsertEmbedDialog
          onClose={() => setActiveDialog(null)}
          onInsert={(url) => dispatch(INSERT_EMBED_COMMAND, url)}
        />
      )}
      {activeDialog === 'math' && (
        <InsertMathDialog
          onClose={() => setActiveDialog(null)}
          onInsert={(payload) => dispatch(INSERT_MATH_COMMAND, payload)}
        />
      )}
    </>
  );
}
