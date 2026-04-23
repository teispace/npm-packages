'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/basic', label: 'Basic' },
  { href: '/notion', label: 'Notion' },
  { href: '/customize', label: 'Customize' },
  { href: '/forms', label: 'Forms' },
  { href: '/themed', label: 'Themed' },
  { href: '/playground', label: 'Kitchen sink' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-40 border-b border-[hsl(var(--tei-border))] bg-[hsl(var(--tei-bg))]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-3">
        <Link
          href="/"
          className="mr-3 shrink-0 text-sm font-semibold tracking-tight"
        >
          @teispace/teieditor
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.slice(1).map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[hsl(var(--tei-fg))] text-[hsl(var(--tei-bg))]'
                    : 'text-[hsl(var(--tei-muted-fg))] hover:bg-[hsl(var(--tei-muted))] hover:text-[hsl(var(--tei-fg))]'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
