'use client';

import { ThemedIcon, ThemedImage } from '@teispace/next-themes';
import { DemoCard, PageHeader } from '@/components/demo-card';

function Sun() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

const SVG_LIGHT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="%23ffffff"/><text x="120" y="55" font-family="system-ui" font-size="20" fill="%23111" text-anchor="middle">LIGHT LOGO</text></svg>`);
const SVG_DARK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="%230f1115"/><text x="120" y="55" font-family="system-ui" font-size="20" fill="%23f5f5f5" text-anchor="middle">DARK LOGO</text></svg>`);

export default function ThemedPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Themed images & icons"
        lead="Swap image sources or any React node based on the active theme. Hydration-safe: the fallback renders on the server and for the first frame, then the correct variant swaps in on mount."
      />

      <DemoCard
        title="<ThemedImage />"
        description="Flips between two inline SVG data URIs. Use real file URLs in production."
      >
        <ThemedImage
          sources={{ light: SVG_LIGHT, dark: SVG_DARK }}
          fallbackSrc={SVG_LIGHT}
          alt="Brand logo"
          width={240}
          height={100}
          className="rounded-md border border-token"
        />
      </DemoCard>

      <DemoCard
        title="<ThemedIcon />"
        description="Any node, not just an <img>. Here an SVG sun / moon swap."
      >
        <div className="flex items-center gap-6" style={{ color: 'hsl(var(--accent))' }}>
          <ThemedIcon variants={{ light: <Sun />, dark: <Moon /> }} fallback={<Sun />} />
          <span className="muted-text text-sm">Toggles with the page theme</span>
        </div>
      </DemoCard>

      <DemoCard
        title="Usage"
        code={`import { ThemedImage, ThemedIcon } from '@teispace/next-themes';

<ThemedImage
  sources={{ light: '/logo-light.svg', dark: '/logo-dark.svg' }}
  fallbackSrc="/logo-light.svg"
  alt="Logo"
/>

<ThemedIcon
  variants={{ light: <SunIcon />, dark: <MoonIcon /> }}
  fallback={<SunIcon />}
/>

// For pixel-perfect SSR switching (no mount-flag flash) use CSS:
// html[data-theme="dark"] .logo-light { display: none }
// html[data-theme="dark"] .logo-dark  { display: block }`}
      />
    </div>
  );
}
