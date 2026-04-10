import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { TextNode } from 'lexical';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { $createMentionNode } from './mention-node.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MentionSuggestion {
  id: string;
  name: string;
  avatar?: string;
  type?: string;
}

// ---------------------------------------------------------------------------
// Option class
// ---------------------------------------------------------------------------

export class MentionOption extends MenuOption {
  suggestion: MentionSuggestion;

  constructor(suggestion: MentionSuggestion) {
    super(suggestion.id);
    this.suggestion = suggestion;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface MentionPluginProps {
  /** Trigger character. Default: '@'. */
  trigger?: string;
  /** Fetch suggestions. Called on every query change. */
  onSearch: (query: string) => Promise<MentionSuggestion[]> | MentionSuggestion[];
  /**
   * Custom render function for the suggestions menu.
   * Registry components override this with a styled version.
   */
  menuRenderFn?: (
    anchorElementRef: React.RefObject<HTMLElement | null>,
    itemProps: {
      selectedIndex: number | null;
      selectOptionAndCleanUp: (option: MentionOption) => void;
      setHighlightedIndex: (index: number) => void;
      options: MentionOption[];
    },
    matchingString: string,
  ) => React.ReactPortal | JSX.Element | null;
}

export function MentionPlugin({ trigger = '@', onSearch, menuRenderFn }: MentionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);

  // Trigger on the configured character
  const triggerFn = useBasicTypeaheadTriggerMatch(trigger, {
    minLength: 0,
    maxLength: 25,
  });

  // Fetch suggestions when query changes
  useEffect(() => {
    if (queryString === null) {
      setSuggestions([]);
      return;
    }
    const result = onSearch(queryString);
    if (result instanceof Promise) {
      result.then(setSuggestions);
    } else {
      setSuggestions(result);
    }
  }, [queryString, onSearch]);

  // Convert to MenuOptions
  const options = useMemo(() => suggestions.map((s) => new MentionOption(s)), [suggestions]);

  // Handle selection — insert MentionNode
  const onSelectOption = useCallback(
    (option: MentionOption, textNodeContainingQuery: TextNode | null, closeMenu: () => void) => {
      closeMenu();
      editor.update(() => {
        const { suggestion } = option;
        const mentionNode = $createMentionNode(
          suggestion.name,
          suggestion.id,
          suggestion.type || 'user',
        );
        if (textNodeContainingQuery) {
          textNodeContainingQuery.replace(mentionNode);
        }
        mentionNode.selectNext(0, 0);
      });
    },
    [editor],
  );

  // Default: headless (no UI). Registry provides the render function.
  const defaultRenderFn = useCallback(() => null, []);

  return (
    <LexicalTypeaheadMenuPlugin<MentionOption>
      options={options}
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      menuRenderFn={menuRenderFn ?? defaultRenderFn}
    />
  );
}
