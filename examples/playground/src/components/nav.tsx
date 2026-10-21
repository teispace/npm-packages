'use client';

import { useTheme } from '@teispace/next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Editor' },
  { href: '/notion', label: 'Notion-style' },
  { href: '/comments', label: 'Comment box' },
  { href: '/customize', label: 'Customize' },
  { href: '/headless', label: 'Headless' },
  { href: '/server', label: 'Server render' },
];

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
] as const;

export function Nav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  return (
    <header className="nav">
      <Link href="/" className="brand">
        teieditor
      </Link>
      <nav aria-label="Examples" className="links">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <fieldset className="segmented">
        <legend className="visually-hidden">Theme</legend>
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={theme === t.value}
            aria-label={`Switch to ${t.value} theme`}
            onClick={() => setTheme(t.value)}
          >
            {t.label}
          </button>
        ))}
      </fieldset>
    </header>
  );
}
