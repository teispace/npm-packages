import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getTheme } from '@teispace/next-themes/server';
import { headers } from 'next/headers';
import { Nav } from '@/components/nav';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '@teispace/next-themes examples',
  description: 'Feature-rich, lightweight theme management for Next.js and React.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Zero-flash SSR: read the theme cookie (or Sec-CH-Prefers-Color-Scheme hint)
  // so `initialTheme` is seeded before hydration.
  const initialTheme = await getTheme();
  // The per-request CSP nonce minted in src/proxy.ts. The provider stamps it on
  // its inline script and on any <style> it has to fall back to.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <Providers initialTheme={initialTheme} nonce={nonce}>
          <Nav />
          <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
