import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { TextNode } from 'lexical';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { SlashCommandItem } from './types.js';

// ---------------------------------------------------------------------------
// Option class (required by LexicalTypeaheadMenuPlugin)
// ---------------------------------------------------------------------------

export class SlashCommandOption extends MenuOption {
  item: SlashCommandItem;

  constructor(item: SlashCommandItem) {
    super(item.name);
    this.item = item;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface SlashCommandPluginProps {
  /** Available slash commands. */
  commands: SlashCommandItem[];
  /**
   * Custom render function for the menu UI.
   * If not provided, uses a default unstyled list.
   * Registry components override this with a styled version.
   */
  menuRenderFn?: (
    anchorElementRef: React.RefObject<HTMLElement | null>,
    itemProps: {
      selectedIndex: number | null;
      selectOptionAndCleanUp: (option: SlashCommandOption) => void;
      setHighlightedIndex: (index: number) => void;
      options: SlashCommandOption[];
    },
    matchingString: string,
  ) => React.ReactPortal | JSX.Element | null;
}

export function SlashCommandPlugin({ commands, menuRenderFn }: SlashCommandPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  // Trigger on "/" character
  const triggerFn = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
    maxLength: 50,
  });

  // Convert SlashCommandItems to MenuOptions and filter by query
  const options = useMemo(() => {
    if (queryString === null) return [];
    const q = queryString.toLowerCase();
    return commands
      .filter(
        (cmd) =>
          !q ||
          cmd.label.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.toLowerCase().includes(q)),
      )
      .map((cmd) => new SlashCommandOption(cmd));
  }, [commands, queryString]);

  // Handle selection — Lexical cleans up the trigger text automatically
  const onSelectOption = useCallback(
    (option: SlashCommandOption, _textNode: TextNode | null, closeMenu: () => void) => {
      closeMenu();
      option.item.onSelect(editor);
    },
    [editor],
  );

  // Default render: minimal unstyled list (registry components override this)
  const defaultRenderFn = useCallback(
    (
      anchorElementRef: React.RefObject<HTMLElement | null>,
      itemProps: {
        selectedIndex: number | null;
        selectOptionAndCleanUp: (option: SlashCommandOption) => void;
        setHighlightedIndex: (index: number) => void;
        options: SlashCommandOption[];
      },
    ) => {
      if (itemProps.options.length === 0) return null;

      const anchorEl = anchorElementRef.current;
      if (!anchorEl) return null;

      // Default: render nothing. The registry slash-menu component provides the UI.
      // This makes the npm package headless.
      return null;
    },
    [],
  );

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      options={options}
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      menuRenderFn={menuRenderFn ?? defaultRenderFn}
    />
  );
}
