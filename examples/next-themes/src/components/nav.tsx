'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@teispace/next-themes';

const routes = [
  { href: '/', label: 'Home' },
  { href: '/basic', label: 'Basic' },
  { href: '/typed', label: 'Typed' },
  { href: '/transitions', label: 'Transitions' },
  { href: '/ssr', label: 'SSR' },
  { href: '/scoped', label: 'Scoped' },
  { href: '/themed', label: 'Images / Icons' },
  { href: '/hooks', label: 'Hooks' },
  { href: '/storage', label: 'Storage' },
  { href: '/advanced', label: 'Advanced' },
];

export function Nav() {
  const pathname = usePathname();
  const { theme, resolvedTheme, setTheme, systemTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-token muted-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="font-semibold">
          @teispace/next-themes
        </Link>
        <nav className="flex flex-1 flex-wrap gap-2 text-sm">
          {routes.map((r) => {
            const active = pathname === r.href;
            return (
              <Link
                key={r.href}
                href={r.href}
                className={`rounded-md px-2 py-1 transition-colors ${
                  active
                    ? 'accent-bg'
                    : 'hover:muted-bg muted-text'
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1 rounded-md border border-token p-0.5 text-xs">
          {(['light', 'system', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`rounded px-2 py-1 capitalize transition-colors ${
                theme === t ? 'accent-bg' : 'muted-text hover:muted-bg'
              }`}
              title={t === 'system' ? `System: ${systemTheme}` : t}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="text-xs muted-text">
          resolved: <span className="font-mono">{resolvedTheme}</span>
        </div>
      </div>
    </header>
  );
}
