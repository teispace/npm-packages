import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getTheme } from '@teispace/next-themes/server';
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

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <Providers initialTheme={initialTheme}>
          <Nav />
          <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
