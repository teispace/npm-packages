'use client';

import type { ReactNode } from 'react';
import { TeiSeparator } from '../../ui/separator';

/**
 * Groups toolbar buttons with a separator.
 */
export function ToolbarGroup({
  children,
  showSeparator = true,
}: {
  children: ReactNode;
  showSeparator?: boolean;
}) {
  return (
    <>
      <div className="tei-toolbar-group flex items-center gap-0.5">{children}</div>
      {showSeparator && <TeiSeparator />}
    </>
  );
}
