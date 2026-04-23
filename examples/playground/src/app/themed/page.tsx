'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { CodeBlock } from '@/components/code-block';

const TeiEditor = dynamic(
  () => import('@teispace/teieditor/react').then((m) => ({ default: m.TeiEditor })),
  { ssr: false },
);

interface Palette {
  id: string;
  label: string;
  // HSL triples; the editor reads them as `hsl(var(--tei-*))`.
  vars: Record<string, string>;
}

const PALETTES: Palette[] = [
  {
    id: 'default',
    label: 'Default',
    vars: {},
  },
  {
    id: 'forest',
    label: 'Forest',
    vars: {
      '--tei-bg': '150 30% 98%',
      '--tei-fg': '150 40% 10%',
      '--tei-border': '150 25% 85%',
      '--tei-muted': '150 25% 94%',
      '--tei-muted-fg': '150 15% 40%',
      '--tei-highlight': '150 60% 85%',
      '--tei-selection': '150 60% 80%',
      '--tei-bubble-bg': '150 40% 15%',
      '--tei-bubble-fg': '150 20% 95%',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    vars: {
      '--tei-bg': '25 60% 98%',
      '--tei-fg': '15 50% 15%',
      '--tei-border': '25 40% 88%',
      '--tei-muted': '25 50% 94%',
      '--tei-muted-fg': '15 30% 40%',
      '--tei-highlight': '35 90% 80%',
      '--tei-selection': '15 80% 85%',
      '--tei-bubble-bg': '15 50% 20%',
      '--tei-bubble-fg': '25 30% 96%',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    vars: {
      '--tei-bg': '230 30% 8%',
      '--tei-fg': '220 20% 95%',
      '--tei-border': '230 25% 20%',
      '--tei-muted': '230 25% 14%',
      '--tei-muted-fg': '220 10% 60%',
      '--tei-highlight': '260 60% 40%',
      '--tei-selection': '230 60% 30%',
      '--tei-bubble-bg': '220 20% 95%',
      '--tei-bubble-fg': '230 30% 10%',
    },
  },
];

const SNIPPET = `/* globals.css */
:root {
  --tei-bg: 150 30% 98%;
  --tei-fg: 150 40% 10%;
  --tei-border: 150 25% 85%;
  --tei-highlight: 150 60% 85%;
  /* ...override any --tei-* variable */
}

/* Or swap them at runtime */
document.documentElement.style.setProperty('--tei-fg', '150 40% 10%');`;

export default function ThemedPage() {
  const [paletteId, setPaletteId] = useState('default');
  const palette = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];

  // Scope overrides to a container so they don't leak into the whole app nav.
  // We apply them via inline style on a wrapper below.

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Drop-in
        </span>
        <h1 className="text-2xl font-bold">Themed</h1>
        <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
          Every color is a <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">--tei-*</code> CSS
          custom property. Override them in your stylesheet, toggle with a class, or change at runtime —
          no JS re-render, no component props needed.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[hsl(var(--tei-muted-fg))]">Palette:</span>
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPaletteId(p.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              paletteId === p.id
                ? 'bg-[hsl(var(--tei-fg))] text-[hsl(var(--tei-bg))]'
                : 'bg-[hsl(var(--tei-muted))] text-[hsl(var(--tei-muted-fg))] hover:text-[hsl(var(--tei-fg))]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Code</h2>
          <CodeBlock code={SNIPPET} lang="css" />
          <p className="text-xs text-[hsl(var(--tei-muted-fg))]">
            Dark mode is built in — add <code className="rounded bg-[hsl(var(--tei-muted))] px-1">.dark</code>{' '}
            to any ancestor. All variables swap automatically.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Result</h2>
          <div style={palette.vars as React.CSSProperties} className="rounded-lg">
            <TeiEditor
              placeholder="Try typing..."
              initialValue="<p>This editor swaps palette via <strong>CSS variables only</strong>. No JS re-mount, no prop drilling. Click a palette above to see it react.</p>"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
