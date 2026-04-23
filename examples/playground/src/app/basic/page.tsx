'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { CodeBlock } from '@/components/code-block';

// Client-only: the editor uses browser APIs (selection, matchMedia).
const TeiEditor = dynamic(
  () => import('@teispace/teieditor/react').then((m) => ({ default: m.TeiEditor })),
  { ssr: false },
);

const SNIPPET = `'use client';

import { TeiEditor } from '@teispace/teieditor/react';
import '@teispace/teieditor/styles.css'; // once, anywhere in your app

export default function Editor() {
  return (
    <TeiEditor
      placeholder="Start writing..."
      onChange={(html) => console.log(html)}
    />
  );
}`;

export default function BasicPage() {
  const [html, setHtml] = useState('');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Drop-in
        </span>
        <h1 className="text-2xl font-bold">Basic editor — 3 lines</h1>
        <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
          Install <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">@teispace/teieditor</code>,
          import <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">TeiEditor</code> from the{' '}
          <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">/react</code> subpath, render.
          No scaffolding needed.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Code</h2>
          <CodeBlock code={SNIPPET} />
          <p className="text-xs text-[hsl(var(--tei-muted-fg))]">
            Try <code className="rounded bg-[hsl(var(--tei-muted))] px-1">/</code> for commands, select text
            for a bubble menu.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Result</h2>
          <TeiEditor
            placeholder="Start writing..."
            onChange={setHtml}
            initialValue="<p>This editor was rendered with 3 lines of code. Try <strong>bold</strong>, <em>italic</em>, or type <code>/</code> for commands.</p>"
          />
        </div>
      </div>

      <details className="rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] p-4 text-sm">
        <summary className="cursor-pointer text-sm font-semibold">HTML output</summary>
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-muted))] p-4 text-xs whitespace-pre-wrap break-all">
          {html || '(start typing...)'}
        </pre>
      </details>
    </div>
  );
}
