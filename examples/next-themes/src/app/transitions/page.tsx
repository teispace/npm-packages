'use client';

import { useState } from 'react';
import { useTheme } from '@teispace/next-themes';
import { DemoCard, PageHeader } from '@/components/demo-card';

type Mode = 'off' | 'fade' | 'circular-cursor' | 'circular-center' | 'custom';

export default function TransitionsPage() {
  const { theme, setTheme } = useTheme();
  const [mode, setMode] = useState<Mode>('circular-cursor');
  const [duration, setDuration] = useState(400);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (mode === 'off') return setTheme(next, { transition: false });
    if (mode === 'fade')
      return setTheme(next, { transition: { type: 'fade', duration } });
    if (mode === 'circular-cursor')
      return setTheme(next, { transition: { type: 'circular', origin: 'cursor', duration } });
    if (mode === 'circular-center')
      return setTheme(next, { transition: { type: 'circular', origin: 'center', duration } });
    if (mode === 'custom')
      return setTheme(next, {
        transition: {
          type: 'fade',
          duration,
          css: `
::view-transition-old(root) { animation: fade-out ${duration}ms ease-in-out; }
::view-transition-new(root) { animation: fade-in ${duration}ms ease-in-out; }
@keyframes fade-out { to { opacity: 0; transform: scale(0.98); } }
@keyframes fade-in  { from { opacity: 0; transform: scale(1.02); } }
`,
        },
      });
  };

  const supported = typeof window !== 'undefined' && 'startViewTransition' in document;

  return (
    <div className="space-y-6">
      <PageHeader
        title="View transitions"
        lead="Opt into the View Transitions API. Circular reveal defaults to expanding from the last click; choose center for deterministic demos, or provide your own CSS."
      />

      {!supported ? (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
          Your browser doesn’t implement the View Transitions API. The library degrades gracefully — themes still switch, just without the animation.
        </div>
      ) : null}

      <DemoCard
        title="Controls"
        description="Pick a transition style and a duration, then click to switch. Setting mode='off' shows that per-call override wins."
      >
        <div className="flex flex-wrap gap-2 text-sm">
          {(['off', 'fade', 'circular-cursor', 'circular-center', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md border border-token px-3 py-1.5 ${mode === m ? 'accent-bg' : 'hover:muted-bg'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <span className="muted-text">Duration (ms)</span>
          <input
            type="range"
            min={100}
            max={1500}
            step={50}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-right font-mono">{duration}</span>
        </label>
        <button
          type="button"
          onClick={flip}
          className="mt-4 rounded-md accent-bg px-4 py-2 text-sm"
        >
          Switch to {theme === 'dark' ? 'light' : 'dark'}
        </button>
      </DemoCard>

      <DemoCard
        title="Per-call override"
        code={`// runs in onClick
setTheme(nextTheme, {
  transition: { type: 'circular', origin: 'cursor', duration: 400 },
});

// or fully custom CSS
setTheme(nextTheme, {
  transition: {
    type: 'fade',
    duration: 400,
    css: \`
::view-transition-old(root) { animation: fade-out 400ms ease-in-out; }
::view-transition-new(root) { animation: fade-in  400ms ease-in-out; }
@keyframes fade-out { to { opacity: 0; transform: scale(0.98); } }
@keyframes fade-in  { from { opacity: 0; transform: scale(1.02); } }
\`,
  },
});`}
      />

      <DemoCard
        title="Provider-level default"
        description="Set it once on <ThemeProvider> and every setTheme call uses it. Per-call transition still wins if passed."
        code={`<ThemeProvider transition="circular">{children}</ThemeProvider>

// shorthand values
transition={true}       // 'fade'
transition="fade"
transition="circular"
transition="none"

// full options
transition={{
  type: 'circular',
  duration: 500,
  easing: 'cubic-bezier(.4,0,.2,1)',
  origin: 'cursor' | 'center' | { x: 100, y: 200 },
}}`}
      />
    </div>
  );
}
