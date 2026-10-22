'use client';

import { ThemeProvider } from '@teispace/next-themes';

export function Providers({
  children,
  initialTheme,
  nonce,
}: {
  children: React.ReactNode;
  initialTheme: string | null;
  nonce?: string;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      themes={['light', 'dark']}
      storage="hybrid"
      initialTheme={initialTheme ?? undefined}
      enableColorScheme
      themeColor={{ light: '#ffffff', dark: '#0f1115' }}
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </ThemeProvider>
  );
}
