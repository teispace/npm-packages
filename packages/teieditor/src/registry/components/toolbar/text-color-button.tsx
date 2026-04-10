'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $patchStyleText } from '@lexical/selection';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TeiButton } from '../../ui/button.js';
import { ColorPicker } from '../../ui/color-picker.js';

/**
 * Text color and background color buttons with color picker popover.
 */
export function TextColorButton() {
  const [editor] = useLexicalComposerContext();
  const [showPicker, setShowPicker] = useState<'text' | 'bg' | null>(null);
  const [textColor, setTextColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('');
  const btnRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setShowPicker(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const applyColor = useCallback(
    (property: string, color: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { [property]: color || null });
        }
      });
    },
    [editor],
  );

  const btnRect = btnRef.current?.getBoundingClientRect();

  return (
    <div ref={btnRef} className="flex items-center gap-0.5">
      {/* Text color */}
      <TeiButton
        onClick={() => setShowPicker(showPicker === 'text' ? null : 'text')}
        title="Text color"
        className="relative"
      >
        <span className="text-xs font-bold">A</span>
        <span
          className="absolute bottom-1 left-1/2 h-0.5 w-3.5 -translate-x-1/2 rounded"
          style={{ backgroundColor: textColor }}
        />
      </TeiButton>

      {/* Background color */}
      <TeiButton
        onClick={() => setShowPicker(showPicker === 'bg' ? null : 'bg')}
        title="Background color"
        className="relative"
      >
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
          style={{ backgroundColor: bgColor || 'hsl(var(--tei-highlight))' }}
        >
          A
        </span>
      </TeiButton>

      {/* Color picker popover */}
      {showPicker &&
        typeof window !== 'undefined' &&
        btnRect &&
        createPortal(
          <div
            ref={pickerRef}
            className="fixed z-50 rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-popover))] shadow-lg"
            style={{ top: btnRect.bottom + 4, left: btnRect.left }}
          >
            <ColorPicker
              value={showPicker === 'text' ? textColor : bgColor}
              onChange={(color) => {
                if (showPicker === 'text') {
                  setTextColor(color);
                  applyColor('color', color);
                } else {
                  setBgColor(color);
                  applyColor('background-color', color);
                }
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
