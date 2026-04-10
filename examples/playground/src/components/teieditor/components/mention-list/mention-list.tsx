'use client';

import type { MentionOption } from '@teispace/teieditor/extensions/mention';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface MentionListProps {
  anchorElementRef: RefObject<HTMLElement | null>;
  itemProps: {
    selectedIndex: number | null;
    selectOptionAndCleanUp: (option: MentionOption) => void;
    setHighlightedIndex: (index: number) => void;
    options: MentionOption[];
  };
  matchingString: string;
}

/**
 * Styled mention suggestions list. Pass as `menuRenderFn` to MentionPlugin.
 */
export function MentionList({ anchorElementRef, itemProps }: MentionListProps) {
  const { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex } = itemProps;
  const anchorEl = anchorElementRef.current;

  if (options.length === 0 || !anchorEl) return null;

  return createPortal(
    <div
      className="tei-mention-menu z-50 max-h-56 w-56 overflow-y-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg"
      role="listbox"
    >
      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        const { suggestion } = option;
        return (
          <button
            key={option.key}
            ref={(el) => option.setRefElement(el)}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={[
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
              isSelected
                ? 'bg-[hsl(var(--tei-accent))] text-[hsl(var(--tei-accent-fg))]'
                : 'text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent)/.5)]',
            ].join(' ')}
            onClick={() => selectOptionAndCleanUp(option)}
            onMouseEnter={() => setHighlightedIndex(index)}
          >
            {suggestion.avatar ? (
              <img src={suggestion.avatar} alt="" className="h-6 w-6 rounded-full" />
            ) : (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tei-primary)/.1)] text-xs font-medium text-[hsl(var(--tei-primary))]">
                {suggestion.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate font-medium">{suggestion.name}</span>
          </button>
        );
      })}
    </div>,
    anchorEl,
  );
}
