'use client';

import { useEffect, useState } from 'react';
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

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.remove('dark', 'light');
    }
  }, [theme]);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-[hsl(var(--tei-border))] p-0.5">
      {(['light', 'system', 'dark'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTheme(t)}
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            theme === t
              ? 'bg-[hsl(var(--tei-fg))] text-[hsl(var(--tei-bg))]'
              : 'text-[hsl(var(--tei-muted-fg))] hover:text-[hsl(var(--tei-fg))]'
          }`}
          title={t === 'system' ? 'System preference' : `${t} mode`}
        >
          {t === 'light' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
            </svg>
          )}
          {t === 'dark' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          )}
          {t === 'system' && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [output, setOutput] = useState('');
  const [format, setFormat] = useState<'html' | 'markdown' | 'json' | 'text'>('html');
  const [mode, setMode] = useState<'full' | 'notion'>('full');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">TeiEditor Playground</h1>
          <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
            Type{' '}
            <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">/</code> for commands,{' '}
            <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">@</code> for mentions,{' '}
            <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">:</code> for emoji,{' '}
            select text for bubble menu, right-click for context menu.
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Editor mode tabs */}
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

        {/* Output format selector */}
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

      {/* Feature hints based on mode */}
      <div className="flex flex-wrap gap-2 text-[10px] text-[hsl(var(--tei-muted-fg))]">
        {mode === 'full' ? (
          <>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Toolbar</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Bubble Menu</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">/ Slash Commands</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">@ Mentions</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">: Emoji</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Code Actions</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Table Resize</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Auto-Embed</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Context Menu</span>
          </>
        ) : (
          <>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">No Toolbar</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Bubble Menu</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">/ Slash Commands</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">@ Mentions</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">: Emoji</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Drag Handles</span>
            <span className="rounded-full border border-[hsl(var(--tei-border))] px-2 py-0.5">Keyboard Shortcuts</span>
          </>
        )}
      </div>

      {/* Editor */}
      <PlaygroundEditor onChange={setOutput} format={format} mode={mode} />

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
