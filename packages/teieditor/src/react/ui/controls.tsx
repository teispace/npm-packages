'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
  useState,
} from 'react';
import { Button } from './button.js';
import { usePartClass } from './context.js';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    const cls = usePartClass('input', 'tei-input', className);
    return <input {...rest} ref={ref} className={cls} data-tei-part="input" />;
  },
);

/**
 * The native `<select>`: the platform's own picker, best on phones. Under a
 * strict `style-src`, Safari reports a `style-src-attr` violation for each
 * one it renders (from styles in its own control, not the page); where
 * reports must stay empty, use `DropdownMenu`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    const cls = usePartClass('select', 'tei-select', className);
    return <select {...rest} ref={ref} className={cls} data-tei-part="select" />;
  },
);

/** A labelled control with an optional hint or error. The child gets the label's id. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
  }) => ReactNode;
}) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className="tei-field">
      <label className="tei-label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': note != null ? `${id}-note` : undefined,
        'aria-invalid': error != null ? true : undefined,
      })}
      {note != null && (
        <span id={`${id}-note`} className="tei-hint" data-error={error != null ? '' : undefined}>
          {note}
        </span>
      )}
    </div>
  );
}

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
}

/** An on/off switch: a native checkbox with `role="switch"`, labelled. */
export function Switch({ checked, onCheckedChange, label, className, ...rest }: SwitchProps) {
  const cls = usePartClass('switch', 'tei-switch', className);
  return (
    <label className="tei-switch-row">
      <span>{label}</span>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        className={cls}
        data-tei-part="switch"
        checked={checked}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
    </label>
  );
}

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name of the field. */
  label: string;
  decrementLabel?: string;
  incrementLabel?: string;
  /**
   * What the buttons do, instead of adding or taking `step`: for a scale
   * (font sizes) that isn't evenly spaced.
   */
  onStep?: (direction: 1 | -1) => void;
  /** Whether a field is disabled as a whole. */
  disabled?: boolean;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * − [ 16 ] +: a number field with buttons, for font sizes and the like.
 * Typing commits on Enter or blur; arrows step while focused.
 */
export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 400,
  step = 1,
  label,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  onStep,
  disabled,
  className,
}: NumberStepperProps) {
  const cls = usePartClass('stepper', 'tei-stepper', className);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (next: number) => {
    setDraft(null);
    if (Number.isFinite(next)) onChange(clamp(next, min, max));
  };
  return (
    <div className={cls} data-tei-part="stepper">
      <Button
        icon={MINUS}
        label={decrementLabel}
        size="sm"
        disabled={disabled || value <= min}
        onClick={() => (onStep ? onStep(-1) : commit(value - step))}
      />
      <Input
        type="number"
        inputMode="decimal"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => draft !== null && commit(Number(draft))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(Number(draft ?? value));
          } else if (event.key === 'Escape' && draft !== null) {
            event.stopPropagation();
            setDraft(null);
          }
        }}
      />
      <Button
        icon={PLUS}
        label={incrementLabel}
        size="sm"
        disabled={disabled || value >= max}
        onClick={() => (onStep ? onStep(1) : commit(value + step))}
      />
    </div>
  );
}

export interface ColorSwatch {
  /** Any CSS colour; `null` is "no colour" (reset). */
  value: string | null;
  label: string;
}

export interface ColorPickerProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  swatches: readonly ColorSwatch[];
  /** Offer a free choice through the native colour input. Default true. */
  custom?: boolean;
  customLabel?: string;
  columns?: number;
  className?: string;
}

/**
 * A grid of swatches plus a custom colour. Arrow keys move through the
 * grid; each swatch announces its name and whether it is selected.
 */
export function ColorPicker({
  value,
  onChange,
  swatches,
  custom = true,
  customLabel = 'Custom colour',
  columns = 8,
  className,
}: ColorPickerProps) {
  const cls = usePartClass('swatches', 'tei-swatches', className);
  const swatchCls = usePartClass('swatch', 'tei-swatch');
  const normalized = value?.toLowerCase() ?? null;
  return (
    <div data-tei-part="color-picker">
      <div
        role="group"
        className={cls}
        data-tei-part="swatches"
        ref={(el) => {
          el?.style.setProperty('--tei-swatch-columns', String(columns));
        }}
        onKeyDown={(event) => {
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
          );
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
          const delta =
            event.key === 'ArrowRight'
              ? rtl
                ? -1
                : 1
              : event.key === 'ArrowLeft'
                ? rtl
                  ? 1
                  : -1
                : event.key === 'ArrowDown'
                  ? columns
                  : event.key === 'ArrowUp'
                    ? -columns
                    : 0;
          if (!delta) return;
          event.preventDefault();
          event.stopPropagation();
          buttons[clamp(index + delta, 0, buttons.length - 1)]?.focus();
        }}
      >
        {swatches.map((swatch) => (
          <button
            key={swatch.value ?? 'none'}
            type="button"
            className={swatchCls}
            data-tei-part="swatch"
            data-empty={swatch.value === null ? '' : undefined}
            aria-label={swatch.label}
            title={swatch.label}
            aria-pressed={(swatch.value?.toLowerCase() ?? null) === normalized}
            ref={(el) => {
              if (el && swatch.value) el.style.setProperty('--tei-swatch', swatch.value);
            }}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onChange(swatch.value)}
          />
        ))}
      </div>
      {custom && (
        <label className="tei-switch-row">
          <span className="tei-hint">{customLabel}</span>
          <input
            type="color"
            className="tei-swatch"
            aria-label={customLabel}
            value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? (value as string) : '#000000'}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </label>
      )}
    </div>
  );
}

export interface GridPickerProps {
  rows?: number;
  columns?: number;
  onPick: (rows: number, columns: number) => void;
  /** "{rows} × {columns}". */
  formatCaption?: (rows: number, columns: number) => string;
  className?: string;
}

/** Pick a size by hovering a grid (insert table). Arrow keys and Enter work too. */
export function GridPicker({
  rows = 8,
  columns = 10,
  onPick,
  formatCaption = (r, c) => `${r} × ${c}`,
  className,
}: GridPickerProps) {
  const cls = usePartClass('gridPicker', 'tei-grid-picker', className);
  const [size, setSize] = useState({ rows: 1, columns: 1 });
  const cells: ReactNode[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= columns; c++) {
      const active = r <= size.rows && c <= size.columns;
      cells.push(
        <button
          key={`${r}-${c}`}
          type="button"
          tabIndex={r === size.rows && c === size.columns ? 0 : -1}
          className="tei-grid-cell"
          data-active={active ? '' : undefined}
          aria-label={formatCaption(r, c)}
          onPointerEnter={() => setSize({ rows: r, columns: c })}
          onFocus={() => setSize({ rows: r, columns: c })}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onPick(r, c)}
        />,
      );
    }
  }
  return (
    <div data-tei-part="grid-picker">
      <div
        role="group"
        className={cls}
        ref={(el) => {
          el?.style.setProperty('--tei-grid-columns', String(columns));
        }}
        onKeyDown={(event) => {
          const moves: Record<string, [number, number]> = {
            ArrowRight: [0, 1],
            ArrowLeft: [0, -1],
            ArrowDown: [1, 0],
            ArrowUp: [-1, 0],
          };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          event.stopPropagation();
          const next = {
            rows: clamp(size.rows + move[0], 1, rows),
            columns: clamp(size.columns + move[1], 1, columns),
          };
          setSize(next);
          const index = (next.rows - 1) * columns + (next.columns - 1);
          (event.currentTarget.children[index] as HTMLElement | undefined)?.focus();
        }}
      >
        {cells}
      </div>
      <div className="tei-grid-caption" aria-live="polite">
        {formatCaption(size.rows, size.columns)}
      </div>
    </div>
  );
}

const MINUS = [['path', { d: 'M5 12h14' }]] as const;
const PLUS = [['path', { d: 'M5 12h14M12 5v14' }]] as const;
