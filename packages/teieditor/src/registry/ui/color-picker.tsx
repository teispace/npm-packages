'use client';

import { useCallback, useRef, useState } from 'react';

const PRESET_COLORS = [
  // Row 1: grays
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#b7b7b7',
  '#cccccc',
  '#d9d9d9',
  '#efefef',
  '#f3f3f3',
  '#ffffff',
  // Row 2: vivid
  '#980000',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#0000ff',
  '#9900ff',
  '#ff00ff',
  // Row 3: pastels
  '#e6b8af',
  '#f4cccc',
  '#fce5cd',
  '#fff2cc',
  '#d9ead3',
  '#d0e0e3',
  '#c9daf8',
  '#cfe2f3',
  '#d9d2e9',
  '#ead1dc',
  // Row 4: medium
  '#dd7e6b',
  '#ea9999',
  '#f9cb9c',
  '#ffe599',
  '#b6d7a8',
  '#a2c4c9',
  '#a4c2f4',
  '#9fc5e8',
  '#b4a7d6',
  '#d5a6bd',
  // Row 5: deep
  '#cc4125',
  '#e06666',
  '#f6b26b',
  '#ffd966',
  '#93c47d',
  '#76a5af',
  '#6d9eeb',
  '#6fa8dc',
  '#8e7cc3',
  '#c27ba0',
];

export interface ColorPickerProps {
  /** Currently selected color (hex). */
  value?: string;
  /** Called when a color is selected. */
  onChange: (color: string) => void;
  /** Additional colors to show. */
  colors?: string[];
  /** Additional class. */
  className?: string;
}

/**
 * Color picker with preset swatches and custom hex input.
 */
export function ColorPicker({
  value,
  onChange,
  colors = PRESET_COLORS,
  className = '',
}: ColorPickerProps) {
  const [customColor, setCustomColor] = useState(value || '#000000');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCustomChange = useCallback(
    (hex: string) => {
      setCustomColor(hex);
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        onChange(hex);
      }
    },
    [onChange],
  );

  return (
    <div className={`tei-color-picker flex flex-col gap-2 p-2 ${className}`.trim()}>
      {/* Preset swatches */}
      <div className="grid grid-cols-10 gap-0.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => {
              onChange(color);
              setCustomColor(color);
            }}
            className={[
              'h-5 w-5 rounded-sm border transition-transform hover:scale-125',
              value === color
                ? 'border-[hsl(var(--tei-ring))] ring-1 ring-[hsl(var(--tei-ring))]'
                : 'border-[hsl(var(--tei-border))]',
            ].join(' ')}
            style={{ backgroundColor: color }}
            title={color}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>

      {/* Custom color input */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="h-6 w-6 rounded-md border border-[hsl(var(--tei-border))]"
          style={{ backgroundColor: customColor }}
          aria-label="Pick custom color"
        >
          <input
            ref={inputRef}
            type="color"
            value={customColor}
            onChange={(e) => handleCustomChange(e.target.value)}
            className="sr-only"
            tabIndex={-1}
          />
        </button>
        <input
          type="text"
          value={customColor}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="#000000"
          maxLength={7}
          className="h-6 w-20 rounded border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] px-2 text-xs text-[hsl(var(--tei-fg))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--tei-ring))]"
        />
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xs text-[hsl(var(--tei-muted-fg))] hover:text-[hsl(var(--tei-fg))]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
