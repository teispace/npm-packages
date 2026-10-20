import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { connection } from 'next/server';
// The tokens and rules every editor needs, as `teieditor init` instructs.
import '@teispace/teieditor/styles.css';
import './globals.css';
import { Nav } from '@/components/nav';
import { ThemeToggle } from '@/components/theme-toggle';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TeiEditor — Examples',
  description: 'Feature-rich, easy-to-use rich text editor for React and Next.js',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request, so Next.js can stamp its scripts with the nonce the
  // proxy put in this request's Content-Security-Policy (src/proxy.ts).
  await connection();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <div className="fixed top-3 right-4 z-50">
          <ThemeToggle />
        </div>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
