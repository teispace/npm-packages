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

export default function Home() {
  const [output, setOutput] = useState('');
  const [format, setFormat] = useState<'html' | 'markdown' | 'json' | 'text'>('html');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">TeiEditor Playground</h1>
          <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
            Test all features. Type <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">/</code> for
            commands, <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">@</code> for mentions,
            select text for bubble menu.
          </p>
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
                  : 'bg-[hsl(var(--tei-muted))] text-[hsl(var(--tei-muted-fg))]'
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <PlaygroundEditor onChange={setOutput} format={format} />

      {/* Output */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{format.toUpperCase()} Output</h2>
        <pre className="max-h-64 overflow-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-muted))] p-4 text-xs whitespace-pre-wrap break-all">
          {output || '(start typing...)'}
        </pre>
      </div>
    </div>
  );
}
