'use client';

import { DemoCard, PageHeader } from '@/components/demo-card';
import { TypedScopedTheme, TypedThemeProvider, useTypedTheme, useTypedThemeValue } from './theme';

const THEMES = [
  'light',
  'dark',
  'sepia',
  'mint',
  'solarized',
  'dracula',
  'nord',
] as const;

const DESCRIPTIONS: Record<(typeof THEMES)[number], { blurb: string; swatch: string }> = {
  light: { blurb: 'Crisp, neutral default.', swatch: 'bg-white border-slate-200' },
  dark: { blurb: 'High-contrast night mode.', swatch: 'bg-slate-900 border-slate-700' },
  sepia: { blurb: 'Warm paper tone — easy on the eyes for long reads.', swatch: 'bg-amber-50 border-amber-200' },
  mint: { blurb: 'Cool, low-saturation green — calm and fresh.', swatch: 'bg-emerald-50 border-emerald-200' },
  solarized: { blurb: 'Ethan Schoonover’s classic. Balanced, scientifically designed.', swatch: 'bg-[#fdf6e3] border-[#93a1a1]' },
  dracula: { blurb: 'Vivid dark palette — popular in editors.', swatch: 'bg-[#282a36] border-[#6272a4]' },
  nord: { blurb: 'Frosty, muted dark. Soft on the eyes.', swatch: 'bg-[#2e3440] border-[#4c566a]' },
};

function Palette() {
  const { theme, setTheme } = useTypedTheme();
  const accent = useTypedThemeValue({
    light: '#2563eb',
    dark: '#60a5fa',
    sepia: '#b45309',
    mint: '#0f766e',
    solarized: '#268bd2',
    dracula: '#ff79c6',
    nord: '#88c0d0',
  });
  const label = useTypedThemeValue({
    light: DESCRIPTIONS.light.blurb,
    dark: DESCRIPTIONS.dark.blurb,
    sepia: DESCRIPTIONS.sepia.blurb,
    mint: DESCRIPTIONS.mint.blurb,
    solarized: DESCRIPTIONS.solarized.blurb,
    dracula: DESCRIPTIONS.dracula.blurb,
    nord: DESCRIPTIONS.nord.blurb,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t)}
            className={`flex items-center gap-2 rounded-md border border-token px-3 py-2 text-left text-sm capitalize transition-colors ${
              theme === t ? 'accent-bg' : 'hover:muted-bg'
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full border ${DESCRIPTIONS[t].swatch}`} />
            <span>{t}</span>
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
        title="Custom themes + typed factory"
        lead="`createThemes({ themes: [...] as const })` returns a provider + hooks whose types know your themes. The package imposes no limit — pair light/dark with sepia, solarized, dracula, nord, or any brand palette. Seven themes are live below."
      />

      <DemoCard
        title="Live demo — 7 themes"
        description="This demo uses an isolated nested provider with its own storage key (`typed-theme`) so it doesn't clash with the root light/dark provider in the header. Click a theme to switch instantly. Because `as const` is on the tuple, every `setTheme` call, every `useThemeValue` key, and every `ScopedTheme.theme` is type-checked against this list."
      >
        <TypedThemeProvider>
          <Palette />
          <div className="mt-4 rounded-md border border-token p-3 text-sm">
            <span className="muted-text">Scoped overrides — same provider, different sub-trees: </span>
            <TypedScopedTheme theme="solarized">
              <span className="mr-1 inline-block rounded px-2 py-1 text-xs" style={{ background: 'hsl(var(--card))', color: 'hsl(var(--fg))' }}>
                solarized
              </span>
            </TypedScopedTheme>
            <TypedScopedTheme theme="dracula">
              <span className="mr-1 inline-block rounded px-2 py-1 text-xs" style={{ background: 'hsl(var(--card))', color: 'hsl(var(--fg))' }}>
                dracula
              </span>
            </TypedScopedTheme>
            <TypedScopedTheme theme="nord">
              <span className="inline-block rounded px-2 py-1 text-xs" style={{ background: 'hsl(var(--card))', color: 'hsl(var(--fg))' }}>
                nord
              </span>
            </TypedScopedTheme>
          </div>
        </TypedThemeProvider>
      </DemoCard>

      <DemoCard
        title="Factory setup"
        description="Define your themes once, as a literal tuple, and everything downstream infers from it."
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
  themes: [
    'light',
    'dark',
    'sepia',
    'mint',
    'solarized',
    'dracula',
    'nord',
    // add as many as you like
  ] as const,
  defaultTheme: 'light',
  attribute: 'class',
  storage: 'hybrid',
});`}
      />

      <DemoCard
        title="Usage"
        description="Keys of every map — `useThemeValue`, `useThemeEffect`, `setTheme`, `ScopedTheme.theme` — are typed against your tuple, so adding or removing a theme is a compile-time refactor."
        code={`import { useTheme, useThemeValue } from './theme';

export function AccentCard() {
  const { theme, setTheme } = useTheme();
  // theme:    'light' | 'dark' | 'sepia' | 'mint' | 'solarized' | 'dracula' | 'nord'
  // setTheme: narrowed to the same union

  const accent = useThemeValue({
    light: '#2563eb',
    dark: '#60a5fa',
    sepia: '#b45309',
    mint: '#0f766e',
    solarized: '#268bd2',
    dracula: '#ff79c6',
    nord: '#88c0d0',
    // missing a key is fine; unknown keys are a compile error
  });

  return <button onClick={() => setTheme('dracula')} style={{ color: accent }}>Dracula</button>;
}`}
      />

      <DemoCard
        title="CSS tokens per theme"
        description="Each theme maps to CSS variables on the `.theme-name` class (or `[data-theme='theme-name']` — both are registered as Tailwind custom variants in globals.css). Define as many tokens as your design needs."
        code={`/* globals.css */
@import "tailwindcss";
@import "@teispace/next-themes/tailwind.css";

@custom-variant solarized (
  &:where([data-theme="solarized"], [data-theme="solarized"] *, .solarized, .solarized *)
);

.solarized {
  --bg: 44 87% 94%;     /* base3 */
  --fg: 196 25% 30%;    /* base00 */
  --accent: 205 69% 49%; /* blue */
  color-scheme: light;
}

body {
  background: hsl(var(--bg));
  color: hsl(var(--fg));
}`}
      />
    </div>
  );
}
