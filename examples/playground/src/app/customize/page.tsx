'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { FontFamily } from '@teispace/teieditor/extensions/font-family';
import type { TeiExtension } from '@teispace/teieditor/core';
import { CodeBlock } from '@/components/code-block';

const TeiEditor = dynamic(
  () => import('@teispace/teieditor/react').then((m) => ({ default: m.TeiEditor })),
  { ssr: false },
);

const SNIPPET = `import { TeiEditor } from '@teispace/teieditor/react';
import { FontFamily } from '@teispace/teieditor/extensions/font-family';

<TeiEditor
  readOnly={readOnly}
  format="markdown"
  initialValue="# Hello"
  initialFormat="markdown"
  // Add extensions on top of the default starter kit
  extensions={[
    FontFamily.configure({
      families: [
        { label: 'Default', value: '' },
        { label: 'Inter', value: 'Inter, sans-serif' },
        { label: 'Fira Code', value: '"Fira Code", monospace' },
      ],
    }),
  ]}
/>`;

export default function CustomizePage() {
  const [readOnly, setReadOnly] = useState(false);
  const [output, setOutput] = useState('');

  const extensions = useMemo<TeiExtension[]>(
    () => [
      FontFamily.configure({
        families: [
          { label: 'Default', value: '' },
          { label: 'Inter', value: 'Inter, sans-serif' },
          { label: 'Fira Code', value: '"Fira Code", monospace' },
          { label: 'Georgia', value: 'Georgia, serif' },
        ],
      }),
    ],
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Drop-in
        </span>
        <h1 className="text-2xl font-bold">Customize</h1>
        <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
          The drop-in is configurable. Pass extra <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">extensions</code>,
          toggle read-only, hide the bubble menu, switch output format, or supply initial content in any
          supported format.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--tei-fg))]"
          />
          Read-only
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Code</h2>
          <CodeBlock code={SNIPPET} />
          <p className="text-xs text-[hsl(var(--tei-muted-fg))]">
            Any of the 54 built-in extensions can be added this way. They merge into the default starter
            kit — no need to list everything.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Result</h2>
          <TeiEditor
            readOnly={readOnly}
            format="markdown"
            initialFormat="markdown"
            initialValue={
              '# Customize me\n\nI have **extra font families** in the toolbar. Check the Font dropdown — Inter, Fira Code, Georgia are all wired up via `FontFamily.configure(...)`.\n\nFlip the **Read-only** checkbox above to lock editing.'
            }
            extensions={extensions}
            onChange={setOutput}
          />
        </div>
      </div>

      <details className="rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] p-4 text-sm">
        <summary className="cursor-pointer text-sm font-semibold">Markdown output</summary>
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-muted))] p-4 text-xs whitespace-pre-wrap break-all">
          {output || '(start typing...)'}
        </pre>
      </details>
    </div>
  );
}
