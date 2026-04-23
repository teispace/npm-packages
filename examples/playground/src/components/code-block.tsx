'use client';

import { useState } from 'react';

export function CodeBlock({ code, lang = 'tsx' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onCopy}
        className="absolute right-2 top-2 rounded-md border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--tei-muted-fg))] opacity-0 transition-opacity hover:text-[hsl(var(--tei-fg))] group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="overflow-auto rounded-lg border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-muted))] p-4 text-xs leading-relaxed">
        <code data-lang={lang}>{code}</code>
      </pre>
    </div>
  );
}
