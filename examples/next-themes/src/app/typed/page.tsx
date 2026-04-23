'use client';

import { DemoCard, PageHeader } from '@/components/demo-card';
import { TypedScopedTheme, TypedThemeProvider, useTypedTheme, useTypedThemeValue } from './theme';

const THEMES = ['light', 'dark', 'sepia', 'mint'] as const;

function Palette() {
  const { theme, setTheme } = useTypedTheme();
  const accent = useTypedThemeValue({
    light: '#2563eb',
    dark: '#60a5fa',
    sepia: '#b45309',
    mint: '#0f766e',
  });
  const label = useTypedThemeValue({
    light: 'Crisp and clean',
    dark: 'Easy on the eyes',
    sepia: 'Warm and paper-like',
    mint: 'Cool and calming',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {THEMES.map((t) => (
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
      <div
        className="rounded-md border border-token p-4 text-sm transition-colors"
        style={{ background: 'hsl(var(--card))', color: accent }}
      >
        <strong className="block">Current theme: {theme}</strong>
        <p className="muted-text">{label}</p>
      </div>
    </div>
  );
}

export default function TypedPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Typed factory"
        lead="createThemes({ themes: [...] as const }) returns a provider + hooks whose types know your themes. setTheme, useThemeValue keys, ScopedTheme.theme — all literal-typed."
      />

      <DemoCard
        title="Live demo"
        description="A nested provider with its own theme list. Note the isolated storage key — doesn't clash with the root light/dark provider."
      >
        <TypedThemeProvider>
          <Palette />
          <div className="mt-4 rounded-md border border-token p-3 text-sm">
            <span className="muted-text">Scoped override </span>
            <TypedScopedTheme theme="sepia">
              <span className="inline-block rounded px-2 py-1" style={{ background: 'hsl(var(--card))', color: 'hsl(var(--fg))' }}>
                always sepia
              </span>
            </TypedScopedTheme>
          </div>
        </TypedThemeProvider>
      </DemoCard>

      <DemoCard
        title="Factory setup"
        code={`// theme.ts
'use client';
import { createThemes } from '@teispace/next-themes';

export const {
  ThemeProvider,
  useTheme,
  useThemeValue,
  useThemeEffect,
  ThemedImage,
  ThemedIcon,
  ScopedTheme,
} = createThemes({
  themes: ['light', 'dark', 'sepia', 'mint'] as const,
  defaultTheme: 'light',
  attribute: 'class',
  storage: 'hybrid',
});`}
      />

      <DemoCard
        title="Usage"
        code={`// any component
import { useTheme, useThemeValue } from './theme';

export function Palette() {
  const { theme, setTheme } = useTheme();
  //         ^? 'light' | 'dark' | 'sepia' | 'mint'

  const accent = useThemeValue({
    light: '#2563eb',
    dark: '#60a5fa',
    sepia: '#b45309',
    mint: '#0f766e',
  });
  // map keys are type-checked against your theme tuple

  return <button onClick={() => setTheme('sepia')} style={{ color: accent }}>Sepia</button>;
}`}
      />
    </div>
  );
}
