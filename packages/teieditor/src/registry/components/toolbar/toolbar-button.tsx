'use client';

import type { ReactNode } from 'react';
import { TeiButton } from '../../ui/button.js';

export interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  icon: ReactNode;
  className?: string;
}

/**
 * Toolbar button with icon, tooltip, and active state.
 */
export function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  icon,
  className = '',
}: ToolbarButtonProps) {
  return (
    <TeiButton
      onClick={onClick}
      active={active}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={className}
    >
      {icon}
    </TeiButton>
  );
}
