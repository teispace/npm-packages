'use client';

import { $createCodeNode } from '@lexical/code';
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $isRangeSelection } from 'lexical';
import { useCallback } from 'react';

import { Dropdown, DropdownItem } from '../../ui/dropdown';
import {
  IconCheckSquare,
  IconCode,
  IconHeading1,
  IconHeading2,
  IconHeading3,
  IconList,
  IconListOrdered,
  IconQuote,
  IconType,
} from '../../ui/icons';

const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph', icon: <IconType size={14} /> },
  { value: 'h1', label: 'Heading 1', icon: <IconHeading1 size={14} /> },
  { value: 'h2', label: 'Heading 2', icon: <IconHeading2 size={14} /> },
  { value: 'h3', label: 'Heading 3', icon: <IconHeading3 size={14} /> },
  { value: 'bullet', label: 'Bullet List', icon: <IconList size={14} /> },
  { value: 'number', label: 'Numbered List', icon: <IconListOrdered size={14} /> },
  { value: 'check', label: 'Checklist', icon: <IconCheckSquare size={14} /> },
  { value: 'quote', label: 'Quote', icon: <IconQuote size={14} /> },
  { value: 'code', label: 'Code Block', icon: <IconCode size={14} /> },
];

export function BlockTypeDropdown({ blockType }: { blockType: string }) {
  const [editor] = useLexicalComposerContext();

  const currentBlock = BLOCK_TYPES.find((b) => b.value === blockType) || BLOCK_TYPES[0]!;

  const handleSelect = useCallback(
    (type: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        switch (type) {
          case 'paragraph':
            $setBlocksType(selection, () => $createParagraphNode());
            break;
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
            $setBlocksType(selection, () => $createHeadingNode(type as HeadingTagType));
            break;
          case 'quote':
            $setBlocksType(selection, () => $createQuoteNode());
            break;
          case 'code':
            $setBlocksType(selection, () => $createCodeNode());
            break;
          case 'bullet':
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
            break;
          case 'number':
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
            break;
          case 'check':
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
            break;
        }
      });
    },
    [editor],
  );

  return (
    <Dropdown
      trigger={
        <span className="flex items-center gap-1.5 px-1">
          {currentBlock.icon}
          <span className="hidden text-xs sm:inline">{currentBlock.label}</span>
        </span>
      }
      triggerClassName="h-8 px-1.5"
    >
      {BLOCK_TYPES.map((block) => (
        <DropdownItem
          key={block.value}
          onClick={() => handleSelect(block.value)}
          active={blockType === block.value}
          icon={block.icon}
        >
          {block.label}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
