'use client';

import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_CALLOUT_COMMAND } from '@teispace/teieditor/extensions/callout';
import { INSERT_EMBED_COMMAND } from '@teispace/teieditor/extensions/embed';
import { INSERT_IMAGE_COMMAND } from '@teispace/teieditor/extensions/image';
import { INSERT_TABLE_COMMAND } from '@teispace/teieditor/extensions/table';
import { INSERT_TOGGLE_COMMAND } from '@teispace/teieditor/extensions/toggle';
import { useCallback, useState } from 'react';
import { Dropdown, DropdownGroup, DropdownItem } from '../../ui/dropdown';
import {
  IconCallout,
  IconDivider,
  IconImage,
  IconPlus,
  IconTable,
  IconToggle,
  IconVideo,
} from '../../ui/icons';
import { TeiButton } from '../../ui/button';
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
  onInsert: (data: { src: string; altText: string }) => void;
}) {
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [altText, setAltText] = useState('');

  const handleFileSelect = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        onInsert({ src: reader.result as string, altText: file.name });
        onClose();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [onInsert, onClose]);

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

      {mode === 'file' ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <TeiButton onClick={handleFileSelect} variant="default">
            Choose Image File
          </TeiButton>
          <p className="text-xs text-[hsl(var(--tei-muted-fg))]">PNG, JPG, GIF, WebP</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TeiInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/image.png"
            label="Image URL"
          />
          <TeiInput
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Description of the image"
            label="Alt text"
          />
          <div className="flex justify-end gap-2 mt-2">
            <TeiButton onClick={onClose} variant="ghost" size="sm">
              Cancel
            </TeiButton>
            <TeiButton
              onClick={() => {
                if (url.trim()) {
                  onInsert({ src: url.trim(), altText: altText || 'Image' });
                  onClose();
                }
              }}
              variant="default"
              size="sm"
              disabled={!url.trim()}
            >
              Insert
            </TeiButton>
          </div>
        </div>
      )}
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

// ---------------------------------------------------------------------------
// InsertDropdown
// ---------------------------------------------------------------------------

type DialogType = 'image' | 'table' | 'embed' | null;

/**
 * Insert dropdown with proper modal dialogs for rich content insertion.
 */
export function InsertDropdown() {
  const [editor] = useLexicalComposerContext();
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);

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
            onClick={() => editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'info')}
            icon={<IconCallout size={14} />}
          >
            Callout
          </DropdownItem>
          <DropdownItem
            onClick={() => editor.dispatchCommand(INSERT_TOGGLE_COMMAND, 'Toggle')}
            icon={<IconToggle size={14} />}
          >
            Collapsible
          </DropdownItem>
          <DropdownItem
            onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
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
          onInsert={(data) => editor.dispatchCommand(INSERT_IMAGE_COMMAND, data)}
        />
      )}
      {activeDialog === 'table' && (
        <InsertTableDialog
          onClose={() => setActiveDialog(null)}
          onInsert={(data) => editor.dispatchCommand(INSERT_TABLE_COMMAND, data)}
        />
      )}
      {activeDialog === 'embed' && (
        <InsertEmbedDialog
          onClose={() => setActiveDialog(null)}
          onInsert={(url) => editor.dispatchCommand(INSERT_EMBED_COMMAND, url)}
        />
      )}
    </>
  );
}
