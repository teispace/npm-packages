import { ThemeProvider, useTheme } from '@teispace/next-themes/client';
import { createElement as h } from 'react';

/**
 * A minimal app around the generic (non-Next.js) provider, rendered on the
 * server by the test and hydrated in the browser by hydrate.ts. Written with
 * createElement so the same module runs in the test process and the bundle
 * without JSX configuration.
 */

function Toggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return h(
    'button',
    {
      type: 'button',
      'data-testid': 'toggle',
      onClick: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    },
    resolvedTheme || 'none',
  );
}

export function App({ nonce }: { nonce: string }) {
  return h(
    ThemeProvider,
    {
      nonce,
      attribute: 'class',
      defaultTheme: 'light',
      enableSystem: false,
      disableTransitionOnChange: true,
    },
    h(Toggle),
  );
}

export const NONCE = 'harness-nonce';
