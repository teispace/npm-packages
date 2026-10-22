'use client';

import { useTheme } from '@teispace/next-themes';
import { DemoCard, PageHeader } from '@/components/demo-card';

const POLICY = `script-src 'self' 'nonce-…' 'strict-dynamic'
style-src  'self' 'nonce-…'
style-src-attr 'unsafe-inline'`;

export default function CspPage() {
  const { resolvedTheme, setTheme } = useTheme();

  const button = 'rounded-md border border-token px-3 py-1.5 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Security Policy"
        lead="Every page of this app is served under a strict nonce-based CSP (src/proxy.ts). The theme switches below inject transition-disabling and View Transition styles — and none of them is reported as a violation."
      />

      <DemoCard
        title="The policy"
        description="No 'unsafe-inline' for scripts or style elements. The provider receives the request's nonce from the root layout."
      >
        <pre>
          <code>{POLICY}</code>
        </pre>
        <pre className="mt-3">
          <code>{`// app/layout.tsx
const nonce = (await headers()).get('x-nonce') ?? undefined;
<ThemeProvider nonce={nonce} disableTransitionOnChange>…</ThemeProvider>`}</code>
        </pre>
      </DemoCard>

      <DemoCard
        title="Switch under the policy"
        description="Styles go in as constructable stylesheets, which style-src does not govern; engines without them get a <style> carrying the nonce."
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} data-testid="light" onClick={() => setTheme('light')}>
            Light
          </button>
          <button type="button" className={button} data-testid="dark" onClick={() => setTheme('dark')}>
            Dark
          </button>
          <button
            type="button"
            className={button}
            data-testid="dark-fade"
            onClick={() => setTheme('dark', { transition: 'fade' })}
          >
            Dark (fade)
          </button>
          <button
            type="button"
            className={button}
            data-testid="light-circular"
            onClick={() => setTheme('light', { transition: 'circular' })}
          >
            Light (circular)
          </button>
          <span className="text-sm muted-text">
            resolved: <span data-testid="resolved">{resolvedTheme}</span>
          </span>
        </div>
      </DemoCard>
    </div>
  );
}
