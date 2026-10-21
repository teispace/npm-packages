'use client';

import { useMemo } from 'react';
import type { TeiEditor } from '../../core/editor.js';
import type { TeiPlacement } from '../../core/types.js';
import { useItemStates } from '../items.js';
import { Popover } from '../ui/popover.js';
import { Separator } from '../ui/toolbar.js';
import { ItemButton, itemControl, type ToolbarControl } from './editor-toolbar.js';

/** The items of `placement`, as buttons or their named controls, a separator between groups. */
export function PlacementItems({
  editor,
  placement,
  controls,
}: {
  editor: TeiEditor;
  placement: TeiPlacement;
  controls?: Record<string, ToolbarControl>;
}) {
  const items = useMemo(() => editor.items(placement), [editor, placement]);
  const states = useItemStates(editor, items);
  const out: React.ReactNode[] = [];
  let group: string | undefined;
  items.forEach((item, i) => {
    if (out.length > 0 && item.group !== group) out.push(<Separator key={`sep-${item.id}`} />);
    group = item.group;
    const Control = itemControl(item, controls);
    out.push(
      Control ? (
        <Control key={item.id} editor={editor} />
      ) : (
        <ItemButton key={item.id} editor={editor} item={item} state={states[i]} />
      ),
    );
  });
  return <>{out}</>;
}

/**
 * A toolbar over a selected node (an image, a file, an embed): the items
 * of `placement`, floating above `anchor`.
 */
export function NodeToolbar({
  editor,
  anchor,
  placement,
  label,
  control,
  hidden = false,
  controls,
}: {
  editor: TeiEditor;
  anchor: Element;
  placement: TeiPlacement;
  /** Its accessible name. */
  label: string;
  /** Its `data-tei-control`, for CSS and tests. */
  control: string;
  hidden?: boolean;
  controls?: Record<string, ToolbarControl>;
}) {
  return (
    <Popover
      open={!hidden}
      anchor={anchor}
      placement="top"
      offset={8}
      variant="bar"
      dismissOnOutside={false}
      role="toolbar"
      aria-label={label}
      data-tei-control={control}
    >
      <PlacementItems editor={editor} placement={placement} controls={controls} />
    </Popover>
  );
}
