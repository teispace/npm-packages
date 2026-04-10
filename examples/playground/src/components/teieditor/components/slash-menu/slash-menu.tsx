'use client';

import type { SlashCommandOption } from '@teispace/teieditor/extensions/slash-command';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface SlashMenuProps {
  anchorElementRef: RefObject<HTMLElement | null>;
  itemProps: {
    selectedIndex: number | null;
    selectOptionAndCleanUp: (option: SlashCommandOption) => void;
    setHighlightedIndex: (index: number) => void;
    options: SlashCommandOption[];
  };
  matchingString: string;
}

/**
 * Styled slash command menu. Pass this as `menuRenderFn` to SlashCommandPlugin.
 */
export function SlashMenu({ anchorElementRef, itemProps }: SlashMenuProps) {
  const { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex } = itemProps;
  const anchorEl = anchorElementRef.current;

  if (options.length === 0 || !anchorEl) return null;

  // Group options
  const groups = new Map<string, SlashCommandOption[]>();
  for (const option of options) {
    const group = option.item.group || 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(option);
  }

  let globalIndex = 0;

  return createPortal(
    <div
      className="tei-slash-menu z-50 max-h-72 w-64 overflow-y-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] p-1 shadow-lg"
      role="listbox"
    >
      {Array.from(groups.entries()).map(([groupName, groupOptions]) => (
        <div key={groupName}>
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tei-muted-fg))]">
            {groupName}
          </div>
          {groupOptions.map((option) => {
            const index = globalIndex++;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={option.key}
                ref={(el) => option.setRefElement(el)}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={[
                  'flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'bg-[hsl(var(--tei-accent))] text-[hsl(var(--tei-accent-fg))]'
                    : 'text-[hsl(var(--tei-popover-fg))] hover:bg-[hsl(var(--tei-accent)/.5)]',
                ].join(' ')}
                onClick={() => selectOptionAndCleanUp(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {option.item.icon && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))]">
                    <option.item.icon className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-tight">{option.item.label}</div>
                  {option.item.description && (
                    <div className="text-xs leading-tight text-[hsl(var(--tei-muted-fg))] truncate">
                      {option.item.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>,
    anchorEl,
  );
}
