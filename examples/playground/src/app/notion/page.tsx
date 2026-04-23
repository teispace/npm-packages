'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { CodeBlock } from '@/components/code-block';

const TeiEditorNotion = dynamic(
  () => import('@teispace/teieditor/react').then((m) => ({ default: m.TeiEditorNotion })),
  { ssr: false },
);

const SNIPPET = `'use client';

import { TeiEditorNotion } from '@teispace/teieditor/react';
import '@teispace/teieditor/styles.css';

export default function Doc() {
  return (
    <TeiEditorNotion
      placeholder="Type '/' for commands..."
      format="markdown"
      onChange={(md) => console.log(md)}
    />
  );
}`;

export default function NotionPage() {
  const [output, setOutput] = useState('');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Drop-in
        </span>
        <h1 className="text-2xl font-bold">Notion-style</h1>
        <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
          Same drop-in, no fixed toolbar. Slash commands, bubble menu, and drag handles carry the UX —
          the way Notion, Craft, and Linear editors feel.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Code</h2>
          <CodeBlock code={SNIPPET} />
          <ul className="mt-1 flex flex-col gap-1 text-xs text-[hsl(var(--tei-muted-fg))]">
            <li>• Press <code className="rounded bg-[hsl(var(--tei-muted))] px-1">/</code> — slash menu</li>
            <li>• Select text — bubble formatting menu</li>
            <li>• Hover a block — drag handle appears on the left</li>
            <li>• Right-click a block — context menu (duplicate, delete, move)</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Result</h2>
          <TeiEditorNotion
            placeholder="Type '/' for commands..."
            format="markdown"
            onChange={setOutput}
            initialValue="# Welcome\n\nThis is a Notion-style editor. Try:\n\n- Press `/` for the slash menu\n- Select text for the bubble menu\n- Hover any block to reveal the drag handle"
            initialFormat="markdown"
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
