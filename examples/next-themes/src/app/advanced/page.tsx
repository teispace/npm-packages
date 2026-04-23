'use client';

import { useState } from 'react';
import { ThemeProvider, useTheme } from '@teispace/next-themes';
import { DemoCard, PageHeader } from '@/components/demo-card';

function Inner() {
  const { theme, resolvedTheme, forcedTheme, setTheme } = useTheme();
  return (
    <div className="rounded-md border border-token surface p-3 text-sm">
      <div>theme: <span className="font-mono">{theme}</span></div>
      <div>resolved: <span className="font-mono">{resolvedTheme}</span></div>
      <div>forced: <span className="font-mono">{forcedTheme ?? '—'}</span></div>
      <button
        type="button"
        onClick={() => setTheme('light')}
        className="mt-2 rounded-md border border-token px-2 py-1 text-xs"
      >
        Try setTheme('light') — ignored when forcedTheme is set
      </button>
    </div>
  );
}

export default function AdvancedPage() {
  const [trans, setTrans] = useState(true);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Advanced props"
        lead="Things you may need once in a while: forcing a theme, disabling CSS transitions mid-switch, CSP nonces, array attributes, theme-color meta, reduced-motion handling."
      />

      <DemoCard
        title="forcedTheme"
        description="Ignore storage and user choice entirely — useful for marketing pages, print routes, or an admin 'preview as dark mode' toggle. setTheme is a no-op when set."
      >
        <ThemeProvider attribute="class" forcedTheme="dark" storage="none" enableSystem={false}>
          <Inner />
        </ThemeProvider>
      </DemoCard>

      <DemoCard
        title="disableTransitionOnChange"
        description="Toggle to kill CSS transitions for one frame during a theme switch — avoids bizarre mid-flight animations when tokens change."
      >
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={trans}
              onChange={(e) => setTrans(e.target.checked)}
            />
            disableTransitionOnChange
          </label>
        </div>
        <pre className="mt-3">
          <code>{`<ThemeProvider disableTransitionOnChange={${trans}}>
  ...
</ThemeProvider>

// or pass custom CSS (useful to scope the freeze)
disableTransitionOnChange={
  '*,*::before,*::after{transition:none!important;}'
}`}</code>
        </pre>
      </DemoCard>

      <DemoCard
        title="Array attributes"
        description="Apply the theme to several HTML attributes in one shot — handy when migrating or interoperating with legacy CSS."
        code={`<ThemeProvider attribute={['class', 'data-theme', 'data-mode']}>
  {/* <html class="dark" data-theme="dark" data-mode="dark"> ... */}
</ThemeProvider>`}
      />

      <DemoCard
        title="value (map theme → attribute value)"
        description="When your CSS expects different class names or data values than your logical theme names."
        code={`<ThemeProvider
  themes={['light', 'dark', 'solarized']}
  attribute="class"
  value={{
    light: 'theme-light',
    dark: 'theme-dark solar-bg',   // multi-class works
    solarized: 'theme-solarized',
  }}
>`}
      />

      <DemoCard
        title="themeColor (meta tag)"
        description="Syncs <meta name='theme-color'> with the active theme so the browser UI (iOS address bar, Android system bar) matches."
        code={`<ThemeProvider
  themeColor={{ light: '#ffffff', dark: '#0f1115' }}
>`}
      />

      <DemoCard
        title="CSP nonce"
        description="If your CSP uses nonces, pass one and the inline anti-FOUC script will carry it."
        code={`<ThemeProvider nonce={headers().get('x-nonce') ?? undefined}>`}
      />

      <DemoCard
        title="respectReducedMotion"
        description="When the user prefers reduced motion, both the transition-disable freeze and the View Transitions animation are skipped. Set to false to opt out."
        code={`<ThemeProvider
  transition="circular"
  disableTransitionOnChange
  respectReducedMotion={true} // default
>`}
      />

      <DemoCard
        title="onChange callback"
        description="Fires whenever the theme changes — useful for syncing to a server profile or analytics."
        code={`<ThemeProvider
  onChange={(theme, resolved) => {
    fetch('/api/user/theme', {
      method: 'POST',
      body: JSON.stringify({ theme }),
    });
  }}
>`}
      />
    </div>
  );
}
