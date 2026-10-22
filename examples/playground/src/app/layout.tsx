import { ThemeProvider } from '@teispace/next-themes';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
// Everything the editor needs to look right: one stylesheet, plain CSS.
import '@teispace/teieditor/styles.css';
import './globals.css';
import { Nav } from '@/components/nav';

export const metadata: Metadata = {
  title: 'teieditor playground',
  description: 'A rich text editor on Lexical: every setup, under a strict CSP.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The proxy (src/proxy.ts) puts a fresh nonce in each request; reading it
  // renders per request, so Next.js and the theme script can carry it.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" nonce={nonce}>
          <Nav />
          <main className="page">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
