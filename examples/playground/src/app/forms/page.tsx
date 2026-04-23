'use client';

import { useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { CodeBlock } from '@/components/code-block';

const TeiEditor = dynamic(
  () => import('@teispace/teieditor/react').then((m) => ({ default: m.TeiEditor })),
  { ssr: false },
);

const SNIPPET = `'use client';

import { useState } from 'react';
import { TeiEditor } from '@teispace/teieditor/react';

export default function CommentForm() {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Strip tags to check meaningful content
    const plain = body.replace(/<[^>]+>/g, '').trim();
    if (plain.length < 10) {
      setError('Please write at least 10 characters.');
      return;
    }
    setError('');
    fetch('/api/comments', { method: 'POST', body: JSON.stringify({ body }) });
  }

  return (
    <form onSubmit={onSubmit}>
      <TeiEditor onChange={setBody} placeholder="Write a comment..." />
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      <button type="submit">Post</button>
    </form>
  );
}`;

export default function FormsPage() {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const plain = body.replace(/<[^>]+>/g, '').trim();
  const remaining = Math.max(0, 10 - plain.length);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (plain.length < 10) {
      setError('Please write at least 10 characters.');
      setSubmitted(null);
      return;
    }
    setError('');
    setSubmitted(body);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Drop-in
        </span>
        <h1 className="text-2xl font-bold">Forms integration</h1>
        <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
          The editor is a controlled input via <code className="rounded bg-[hsl(var(--tei-muted))] px-1 text-xs">onChange</code>.
          Wire it into any form — plain React state, react-hook-form, Formik, server actions — like you would a textarea.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Code</h2>
          <CodeBlock code={SNIPPET} />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Try it</h2>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <TeiEditor
              placeholder="Write a comment (min 10 chars)..."
              onChange={setBody}
              aria-invalid={error ? 'true' : 'false'}
            />
            <div className="flex items-center justify-between text-xs">
              <span
                className={
                  remaining > 0
                    ? 'text-[hsl(var(--tei-muted-fg))]'
                    : 'text-emerald-600 dark:text-emerald-400'
                }
              >
                {remaining > 0 ? `${remaining} more char${remaining === 1 ? '' : 's'} needed` : 'Ready to post'}
              </span>
              <button
                type="submit"
                className="rounded-md bg-[hsl(var(--tei-fg))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--tei-bg))] transition-opacity hover:opacity-90"
              >
                Post
              </button>
            </div>
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}
            {submitted && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Submitted!</p>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-emerald-900/80 dark:text-emerald-200/80">
                  {submitted}
                </pre>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
