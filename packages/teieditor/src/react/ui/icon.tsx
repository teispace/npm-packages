'use client';

import { createElement, isValidElement, memo, type ReactNode, useContext } from 'react';
import type { TeiIconNode } from '../../core/types.js';
import { TeiEditorContext } from '../context.js';
import { type TeiIconLike, usePartClass, useTeiUI } from './context.js';

export interface IconProps {
  /** An icon name (looked up in the UI config, then the editor), or the icon itself. */
  icon: string | TeiIconLike;
  className?: string;
  /** Mirror in right-to-left text (arrows, indent). */
  flipRtl?: boolean;
}

function isIconNode(value: unknown): value is TeiIconNode {
  return Array.isArray(value) && (value.length === 0 || Array.isArray(value[0]));
}

/** Draw icon data as an inline SVG: no sprite sheet, no fetch, nothing for CSP to block. */
export function renderIconNode(
  node: TeiIconNode,
  className?: string,
  flipRtl?: boolean,
): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-flip-rtl={flipRtl ? '' : undefined}
    >
      {node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/**
 * An icon. A name resolves through `<TeiUIProvider icons>` first, then the
 * editor's icon registry, so either can replace any built-in icon.
 */
export const Icon = memo(function Icon({ icon, className, flipRtl }: IconProps) {
  const { icons } = useTeiUI();
  const editor = useContext(TeiEditorContext);
  const cls = usePartClass('icon', 'tei-icon', className);
  const resolved: TeiIconLike | undefined =
    typeof icon === 'string' ? (icons?.[icon] ?? editor?.icon(icon)) : icon;
  if (resolved == null || resolved === false) return null;
  if (isIconNode(resolved)) return renderIconNode(resolved, cls, flipRtl);
  if (isValidElement(resolved)) return resolved;
  if (typeof resolved === 'function' || (typeof resolved === 'object' && '$$typeof' in resolved)) {
    return createElement(resolved as React.ComponentType<{ className?: string }>, {
      className: cls,
    });
  }
  return <>{resolved as ReactNode}</>;
});
