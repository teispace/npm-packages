'use client';

import { useId } from 'react';

/**
 * A row of buttons for one of a few values. (A native <select> would do,
 * but Safari reports CSP violations for its own styles under this policy.)
 */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="choice">
      <span id={id}>{label}</span>
      <div className="segmented" role="group" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
