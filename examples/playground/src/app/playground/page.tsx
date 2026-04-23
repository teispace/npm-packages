'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const PlaygroundEditor = dynamic(
  () => import('@/components/playground-editor').then((m) => ({ default: m.PlaygroundEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] animate-pulse">
        <div className="h-10 border-b border-[hsl(var(--tei-border))]" />
        <div className="min-h-[500px] p-4">
          <div className="h-4 w-48 rounded bg-[hsl(var(--tei-muted))]" />
        </div>
      </div>
    ),
  },
);

export default function PlaygroundPage() {
  const [output, setOutput] = useState('');
  const [format, setFormat] = useState<'html' | 'markdown' | 'json' | 'text'>('html');
  const [mode, setMode] = useState<'full' | 'notion'>('full');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Kitchen sink</h1>
        <p className="mt-1 text-sm text-[hsl(var(--tei-muted-fg))]">
          Exercises every feature and both editor presets. Uses the{' '}
          <strong>scaffolded</strong> UI path (<code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">npx teieditor init</code>).
          For the drop-in path, see{' '}
          <a href="/basic" className="underline underline-offset-2">/basic</a> or{' '}
          <a href="/notion" className="underline underline-offset-2">/notion</a>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-[hsl(var(--tei-border))] p-0.5">
          {(['full', 'notion'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? 'bg-[hsl(var(--tei-fg))] text-[hsl(var(--tei-bg))]'
                  : 'text-[hsl(var(--tei-muted-fg))] hover:text-[hsl(var(--tei-fg))]'
              }`}
            >
              {m === 'full' ? 'Full (Toolbar)' : 'Notion (No Toolbar)'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[hsl(var(--tei-muted-fg))]">Output:</span>
          {(['html', 'markdown', 'json', 'text'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                format === f
                  ? 'bg-[hsl(var(--tei-fg))] text-[hsl(var(--tei-bg))]'
                  : 'bg-[hsl(var(--tei-muted))] text-[hsl(var(--tei-muted-fg))] hover:text-[hsl(var(--tei-fg))]'
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] text-[hsl(var(--tei-muted-fg))]">
        <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">/ slash commands</span>
        <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">@ mentions</span>
        <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">: emoji</span>
        <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">text select → bubble menu</span>
        <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">right-click → context menu</span>
      </div>

      <PlaygroundEditor onChange={setOutput} format={format} mode={mode} />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{format.toUpperCase()} Output</h2>
        <pre className="max-h-64 overflow-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-muted))] p-4 text-xs whitespace-pre-wrap break-all">
          {output || '(start typing...)'}
        </pre>
      </div>
    </div>
  );
}
