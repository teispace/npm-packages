import Link from 'next/link';
import { PageHeader } from '@/components/demo-card';

const demos = [
  {
    href: '/basic',
    title: 'Basic',
    lead: 'Minimal light/dark/system toggle. The 90% case.',
  },
  {
    href: '/typed',
    title: 'Typed factory',
    lead: 'createThemes({ themes: [...] as const }) for fully-typed setTheme.',
  },
  {
    href: '/transitions',
    title: 'View transitions',
    lead: 'Circular reveal from cursor, fade, custom CSS — all via the View Transitions API.',
  },
  {
    href: '/ssr',
    title: 'SSR',
    lead: 'Read the theme on the server (cookie + Sec-CH-Prefers-Color-Scheme). Zero FOUC.',
  },
  {
    href: '/scoped',
    title: 'Scoped themes',
    lead: 'Force a sub-tree to a different theme without touching the page root.',
  },
  {
    href: '/themed',
    title: 'Themed images & icons',
    lead: 'Swap <img> src / SVG variants per theme.',
  },
  {
    href: '/hooks',
    title: 'Hooks',
    lead: 'useThemeValue for value maps, useThemeEffect for side effects on change.',
  },
  {
    href: '/storage',
    title: 'Storage modes',
    lead: 'hybrid / cookie / local / session / none — pick your persistence.',
  },
  {
    href: '/advanced',
    title: 'Advanced',
    lead: 'forcedTheme, disableTransitionOnChange, CSP nonce, custom attributes, reduced motion.',
  },
];

export default function Home() {
  return (
    <div>
      <PageHeader
        title="@teispace/next-themes"
        lead="Feature-rich, lightweight theme management for Next.js and React. Every feature has a runnable demo below."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {demos.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="block rounded-lg border border-token surface p-5 transition-colors hover:muted-bg"
          >
            <h2 className="text-base font-semibold">{d.title}</h2>
            <p className="mt-1 text-sm muted-text">{d.lead}</p>
          </Link>
        ))}
      </div>

      <section className="mt-10 rounded-lg border border-token surface p-5">
        <h2 className="text-base font-semibold">Install</h2>
        <pre className="mt-3">
          <code>{`yarn add @teispace/next-themes
# or
npm install @teispace/next-themes`}</code>
        </pre>
        <p className="mt-3 text-sm muted-text">
          Full reference:{' '}
          <Link href="https://github.com/teispace/npm-packages/tree/main/packages/next-themes" className="underline">
            README
          </Link>
        </p>
      </section>
    </div>
  );
}
