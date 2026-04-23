import Link from 'next/link';
import { CodeBlock } from '@/components/code-block';

const DEMOS = [
  {
    href: '/basic',
    title: 'Basic',
    description: 'Full-featured editor in 3 lines. Drop-in component, zero config.',
    badge: 'Drop-in',
  },
  {
    href: '/notion',
    title: 'Notion-style',
    description: 'Same drop-in, no fixed toolbar. Slash, bubble, drag handles do the work.',
    badge: 'Drop-in',
  },
  {
    href: '/customize',
    title: 'Customize',
    description: 'Add your own extension, override defaults, hook into onChange.',
    badge: 'Drop-in',
  },
  {
    href: '/forms',
    title: 'Forms',
    description: 'Validate required content and wire into react-hook-form.',
    badge: 'Drop-in',
  },
  {
    href: '/themed',
    title: 'Themed',
    description: 'Switch color palettes at runtime by overriding --tei-* CSS variables.',
    badge: 'Drop-in',
  },
  {
    href: '/playground',
    title: 'Kitchen sink',
    description: 'Every feature, both modes, 4-format output. Uses scaffolded UI.',
    badge: 'Scaffold',
  },
];

const SNIPPET_DROP_IN = `import { TeiEditor } from '@teispace/teieditor/react';
import '@teispace/teieditor/styles.css';

export default function Page() {
  return <TeiEditor onChange={(html) => console.log(html)} />;
}`;

const SNIPPET_SCAFFOLD = `# Own the UI — scaffold the source into your project
npx teieditor init

# Then import what was generated
import { TeiEditor } from '@/components/teieditor/editors/editor';`;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10">
      {/* Hero */}
      <section className="flex flex-col gap-4">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--tei-border))] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--tei-muted-fg))]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Built on Lexical · 54 extensions · Tree-shakable
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          The rich-text editor that just works.
        </h1>
        <p className="max-w-2xl text-lg text-[hsl(var(--tei-muted-fg))]">
          A feature-rich, fully customizable editor for React and Next.js. Pick your adoption path:
          drop-in for speed, scaffolded for ownership.
        </p>

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {/* Path A: drop-in */}
          <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] p-5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Easiest
              </span>
              <h2 className="text-sm font-semibold">Drop-in — 1 command</h2>
            </div>
            <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
              One install, one import, one component. Batteries-included UI.
            </p>
            <CodeBlock code={SNIPPET_DROP_IN} />
            <Link
              href="/basic"
              className="mt-2 inline-flex w-fit items-center gap-1 text-sm font-medium underline underline-offset-2"
            >
              See it live →
            </Link>
          </div>

          {/* Path B: scaffold */}
          <div className="flex flex-col gap-3 rounded-xl border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] p-5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Full control
              </span>
              <h2 className="text-sm font-semibold">Scaffold — 2 commands</h2>
            </div>
            <p className="text-sm text-[hsl(var(--tei-muted-fg))]">
              Own the UI source. Fork, reskin, commit to git. shadcn-style.
            </p>
            <CodeBlock code={SNIPPET_SCAFFOLD} lang="bash" />
            <Link
              href="/playground"
              className="mt-2 inline-flex w-fit items-center gap-1 text-sm font-medium underline underline-offset-2"
            >
              Kitchen sink →
            </Link>
          </div>
        </div>
      </section>

      {/* Demo grid */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Examples</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEMOS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group flex flex-col gap-2 rounded-xl border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] p-4 transition-all hover:border-[hsl(var(--tei-fg))]/40 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{d.title}</h3>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    d.badge === 'Drop-in'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                  }`}
                >
                  {d.badge}
                </span>
              </div>
              <p className="text-xs text-[hsl(var(--tei-muted-fg))]">{d.description}</p>
              <span className="mt-1 text-xs font-medium text-[hsl(var(--tei-muted-fg))] group-hover:text-[hsl(var(--tei-fg))]">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Feature matrix */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">What&apos;s in the box</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: '54 extensions',
              body: 'Formatting, blocks, tables, media, mentions, emoji, math, callouts, layouts…',
            },
            {
              title: '4 output formats',
              body: 'HTML, Markdown, Lexical JSON, plain text. Round-trip freely.',
            },
            {
              title: 'Notion UX',
              body: 'Slash commands, bubble menu, drag handles, context menu, auto-embeds.',
            },
            {
              title: 'SSR safe',
              body: "Next.js App Router friendly. 'use client' done for you.",
            },
            {
              title: 'Themed via CSS vars',
              body: '`--tei-*` variables — override in globals.css. Dark mode included.',
            },
            {
              title: 'Tree-shakable',
              body: 'One entry per extension. Only pay for what you import.',
            },
            {
              title: 'Fully typed',
              body: 'Strict TypeScript. Extensions, config, events — all type-safe.',
            },
            {
              title: 'MIT licensed',
              body: 'Built on Lexical. No rug-pulls.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))] p-4"
            >
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-xs text-[hsl(var(--tei-muted-fg))]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
