import { cookies, headers } from 'next/headers';
import { readColorSchemeHint } from '@teispace/next-themes/server';
import { DemoCard, PageHeader } from '@/components/demo-card';

export default async function SsrPage() {
  const jar = await cookies();
  const cookieTheme = jar.get('theme')?.value ?? null;

  const h = await headers();
  const hintTheme = readColorSchemeHint(h);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server-side rendering"
        lead="getTheme() in the root layout seeds initialTheme before React hydrates. The inline anti-FOUC script runs synchronously in <head>, so the correct theme is painted on first frame — no flash, even for brand-new visitors (via the prefers-color-scheme client hint)."
      />

      <DemoCard
        title="What the server sees right now"
        description="Rendered on the server during this request. Check your DevTools → Application → Cookies to see the theme cookie; toggle the header switch and reload — you'll see the new value here."
      >
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="muted-text">theme cookie</dt>
            <dd className="font-mono">{cookieTheme ?? '— (not yet set)'}</dd>
          </div>
          <div>
            <dt className="muted-text">Sec-CH-Prefers-Color-Scheme</dt>
            <dd className="font-mono">{hintTheme ?? '— (browser did not send it)'}</dd>
          </div>
        </dl>
      </DemoCard>

      <DemoCard
        title="Root layout"
        description="All pages in this example are rendered through this layout. getTheme() prefers the cookie, falling back to the client hint."
        code={`// app/layout.tsx
import { getTheme } from '@teispace/next-themes/server';
import { Providers } from './providers';

export default async function RootLayout({ children }) {
  const initialTheme = await getTheme();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers initialTheme={initialTheme}>{children}</Providers>
      </body>
    </html>
  );
}`}
      />

      <DemoCard
        title="Opt into the client hint"
        description="On the first request to a new visitor the browser does not send Sec-CH-Prefers-Color-Scheme. Set Accept-CH once and subsequent navigations include it, unlocking zero-flash SSR even for users who never pick a theme."
        code={`// middleware.ts
import { NextResponse } from 'next/server';
import { acceptClientHintsHeader } from '@teispace/next-themes/server';

export function middleware() {
  const res = NextResponse.next();
  res.headers.set('Accept-CH', acceptClientHintsHeader());
  return res;
}`}
      />

      <DemoCard
        title="Write from a Server Action"
        description="Use writeThemeCookie() when you want to persist the theme from the server — e.g. saving it alongside a user preference update."
        code={`'use server';
import { writeThemeCookie } from '@teispace/next-themes/server';

export async function saveTheme(theme: string) {
  await writeThemeCookie(theme);
  // ...also persist to your user profile here
}`}
      />
    </div>
  );
}
