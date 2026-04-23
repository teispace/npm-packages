'use client';

import { useTheme } from '@teispace/next-themes';
import { DemoCard, PageHeader } from '@/components/demo-card';

export default function BasicPage() {
  const { theme, resolvedTheme, systemTheme, setTheme, forcedTheme, themes } = useTheme();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Basic toggle"
        lead="The minimum useful setup: a light/dark/system tri-state switch, wired directly from the provider."
      />

      <DemoCard
        title="Current state"
        description="Everything the useTheme() hook returns right now."
      >
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="muted-text">theme</dt><dd className="font-mono">{theme}</dd></div>
          <div><dt className="muted-text">resolved</dt><dd className="font-mono">{resolvedTheme}</dd></div>
          <div><dt className="muted-text">system</dt><dd className="font-mono">{systemTheme ?? 'off'}</dd></div>
          <div><dt className="muted-text">forced</dt><dd className="font-mono">{forcedTheme ?? '—'}</dd></div>
          <div className="col-span-2"><dt className="muted-text">available</dt><dd className="font-mono">{themes.join(', ')}</dd></div>
        </dl>
      </DemoCard>

      <DemoCard
        title="Setter"
        description="Clicking calls setTheme(). The root provider in layout.tsx handles persistence and the anti-FOUC inline script."
      >
        <div className="flex flex-wrap gap-2">
          {(['light', 'system', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`rounded-md border border-token px-3 py-1.5 text-sm capitalize ${
                theme === t ? 'accent-bg' : 'hover:muted-bg'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        title="Code"
        code={`// app/providers.tsx
'use client';
import { ThemeProvider } from '@teispace/next-themes';

export function Providers({ children, initialTheme }: {
  children: React.ReactNode;
  initialTheme: string | null;
}) {
  return (
    <ThemeProvider attribute="class" initialTheme={initialTheme ?? undefined}>
      {children}
    </ThemeProvider>
  );
}

// any client component
import { useTheme } from '@teispace/next-themes';

export function Toggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle
    </button>
  );
}`}
      />
    </div>
  );
}
