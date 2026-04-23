'use client';

import { ScopedTheme, useTheme } from '@teispace/next-themes';
import { DemoCard, PageHeader } from '@/components/demo-card';

function Block({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <div
      className="rounded-md p-3 text-sm"
      style={{ background: 'hsl(var(--card))', color: 'hsl(var(--fg))' }}
    >
      <strong className="block">{label}</strong>
      <span className="muted-text">useTheme().theme = </span>
      <span className="font-mono">{theme}</span>
    </div>
  );
}

export default function ScopedPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Scoped themes"
        lead="Apply a theme to a sub-tree without touching <html>. Inside the wrapper, useTheme() reports the scoped theme and setTheme is a no-op. Great for reversed-theme modals, previews, and marketing sections."
      />

      <DemoCard
        title="Three-up comparison"
        description="The page theme (whatever the nav toggle is set to) wraps the outer card. The middle card is forced dark via data-theme attribute. The right card is forced sepia via class."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-token p-3">
            <Block label="Inherits page" />
          </div>
          <div className="rounded-md border border-token p-0">
            <ScopedTheme theme="dark" attribute="data-theme" className="rounded-md p-3">
              <Block label="Forced dark (data-theme)" />
            </ScopedTheme>
          </div>
          <div className="rounded-md border border-token p-0">
            <ScopedTheme theme="sepia" attribute="class" className="rounded-md p-3">
              <Block label="Forced sepia (class)" />
            </ScopedTheme>
          </div>
        </div>
      </DemoCard>

      <DemoCard
        title="Usage"
        code={`import { ScopedTheme, useTheme } from '@teispace/next-themes';

<ScopedTheme theme="dark">
  <Modal>
    {/* useTheme() here returns { theme: 'dark', resolvedTheme: 'dark', ... }.
        setTheme is a no-op. */}
  </Modal>
</ScopedTheme>

// or render any element
<ScopedTheme theme="sepia" as="section" className="preview">
  <Preview />
</ScopedTheme>

// map theme names to attribute values
<ScopedTheme theme="dark" attribute="class" value={{ dark: 'theme-dark' }}>
  ...
</ScopedTheme>`}
      />
    </div>
  );
}
