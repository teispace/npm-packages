'use client';

import { useState } from 'react';
import { useTheme, useThemeEffect, useThemeValue } from '@teispace/next-themes';
import { DemoCard, PageHeader } from '@/components/demo-card';

function ValueDemo() {
  const color = useThemeValue({ light: '#2563eb', dark: '#60a5fa', default: '#000' });
  const vibe = useThemeValue({ light: 'cool', dark: 'moody', default: 'neutral' });
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-token p-3 text-sm" style={{ color }}>
        Accent color from the map: <span className="font-mono">{color}</span>
      </div>
      <div className="muted-text text-sm">
        Copy: <span className="font-mono">{vibe}</span>
      </div>
    </div>
  );
}

function EffectDemo() {
  const [log, setLog] = useState<string[]>([]);
  useThemeEffect((theme, resolvedTheme) => {
    setLog((l) => [
      `${new Date().toLocaleTimeString()}  →  theme=${theme} resolved=${resolvedTheme}`,
      ...l,
    ].slice(0, 8));
  });
  const { setTheme, theme } = useTheme();
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-md accent-bg px-3 py-1.5 text-sm"
        >
          Toggle
        </button>
        <button
          type="button"
          onClick={() => setLog([])}
          className="rounded-md border border-token px-3 py-1.5 text-sm"
        >
          Clear log
        </button>
      </div>
      <pre className="max-h-48 overflow-auto text-xs">
        <code>
          {log.length === 0
            ? '(the hook skips the first render — toggle above to log a change)'
            : log.join('\n')}
        </code>
      </pre>
    </div>
  );
}

export default function HooksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Hooks: useThemeValue + useThemeEffect"
        lead="Two small hooks that cover the most common 'react to theme' patterns without wiring up your own useEffect boilerplate."
      />

      <DemoCard
        title="useThemeValue(map)"
        description="Maps the active theme to a value. Returns the matching entry for the resolved theme, falling back to the raw selection, then to map.default."
      >
        <ValueDemo />
      </DemoCard>

      <DemoCard
        title="useThemeEffect(callback, deps?)"
        description="Like useEffect, but only fires on theme changes — skips the first render. Click Toggle to populate the log."
      >
        <EffectDemo />
      </DemoCard>

      <DemoCard
        title="Code"
        code={`// useThemeValue: map the active theme to a value
const color = useThemeValue({
  light: '#2563eb',
  dark:  '#60a5fa',
  default: '#000',
});

// useThemeEffect: react to changes (not first render)
useThemeEffect((theme, resolvedTheme) => {
  analytics.track('theme_changed', { theme, resolvedTheme });
  // optional cleanup for the next change
  return () => abortPending();
});`}
      />
    </div>
  );
}
