'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_CALLOUT_COMMAND } from '@teispace/teieditor/extensions/callout';
import { INSERT_EMBED_COMMAND } from '@teispace/teieditor/extensions/embed';
import { INSERT_IMAGE_COMMAND } from '@teispace/teieditor/extensions/image';
import { INSERT_MATH_COMMAND } from '@teispace/teieditor/extensions/math';
import { INSERT_TABLE_COMMAND } from '@teispace/teieditor/extensions/table';
import { INSERT_TOGGLE_COMMAND } from '@teispace/teieditor/extensions/toggle';
import { useCallback } from 'react';
import { Dropdown, DropdownGroup, DropdownItem } from '../../ui/dropdown.js';
import {
  IconCallout,
  IconDivider,
  IconImage,
  IconMath,
  IconPlus,
  IconTable,
  IconToggle,
  IconVideo,
} from '../../ui/icons.js';

/**
 * Insert dropdown for rich content: image, table, embed, callout, toggle, divider, math.
 */
export function InsertDropdown() {
  const [editor] = useLexicalComposerContext();

  const insertImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          src: reader.result as string,
          altText: file.name,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor]);

  const insertEmbed = useCallback(() => {
    const url = window.prompt('Enter URL to embed (YouTube, Twitter, etc.):');
    if (url) editor.dispatchCommand(INSERT_EMBED_COMMAND, url);
  }, [editor]);

  const insertMath = useCallback(() => {
    const expr = window.prompt('Enter math expression:');
    if (expr) editor.dispatchCommand(INSERT_MATH_COMMAND, { expression: expr });
  }, [editor]);

  return (
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
        <DropdownItem onClick={insertImage} icon={<IconImage size={14} />}>
          Image
        </DropdownItem>
        <DropdownItem
          onClick={() =>
            editor.dispatchCommand(INSERT_TABLE_COMMAND, {
              rows: 3,
              columns: 3,
              includeHeaders: true,
            })
          }
          icon={<IconTable size={14} />}
        >
          Table
        </DropdownItem>
        <DropdownItem onClick={insertEmbed} icon={<IconVideo size={14} />}>
          Embed
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
          Toggle
        </DropdownItem>
        <DropdownItem
          onClick={() => editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'warning')}
          icon={<IconCallout size={14} />}
        >
          Warning
        </DropdownItem>
      </DropdownGroup>

      <DropdownGroup label="Other">
        <DropdownItem onClick={insertMath} icon={<IconMath size={14} />}>
          Math
        </DropdownItem>
      </DropdownGroup>
    </Dropdown>
  );
}
