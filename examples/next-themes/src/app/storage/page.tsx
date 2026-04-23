'use client';

import { useEffect, useState } from 'react';
import { DemoCard, PageHeader } from '@/components/demo-card';

function useStorageInspector() {
  const [state, setState] = useState({
    cookieTheme: '',
    localTheme: '',
    sessionTheme: '',
  });

  useEffect(() => {
    const read = () => {
      const cookieTheme =
        document.cookie
          .split('; ')
          .find((c) => c.startsWith('theme='))
          ?.split('=')[1] ?? '';
      setState({
        cookieTheme: decodeURIComponent(cookieTheme),
        localTheme: window.localStorage.getItem('theme') ?? '',
        sessionTheme: window.sessionStorage.getItem('theme') ?? '',
      });
    };
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, []);

  return state;
}

export default function StoragePage() {
  const state = useStorageInspector();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage modes"
        lead="Five modes: hybrid (default, recommended), cookie, local, session, none. The root provider in this example uses hybrid — toggle the theme in the header and both cells update live."
      />

      <DemoCard
        title="What's stored right now"
        description="Polls every 500ms. Toggle the theme in the nav and watch these populate."
      >
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div><dt className="muted-text">cookie “theme”</dt><dd className="font-mono">{state.cookieTheme || '—'}</dd></div>
          <div><dt className="muted-text">localStorage “theme”</dt><dd className="font-mono">{state.localTheme || '—'}</dd></div>
          <div><dt className="muted-text">sessionStorage “theme”</dt><dd className="font-mono">{state.sessionTheme || '—'}</dd></div>
        </dl>
        <p className="mt-3 text-xs muted-text">
          With <code className="font-mono">storage="hybrid"</code> the cookie is authoritative on read (so the server can render the correct theme without a flash) and localStorage mirrors for cross-tab sync.
        </p>
      </DemoCard>

      <DemoCard
        title="Mode comparison"
      >
        <div className="overflow-x-auto text-sm">
          <table className="w-full text-left">
            <thead>
              <tr className="muted-text">
                <th className="py-2 pr-4">mode</th>
                <th className="py-2 pr-4">server-readable</th>
                <th className="py-2 pr-4">cross-tab sync</th>
                <th className="py-2 pr-4">when to use</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-token">
                <td className="py-2 pr-4 font-mono">hybrid</td>
                <td className="py-2 pr-4">✅</td>
                <td className="py-2 pr-4">✅</td>
                <td className="py-2 pr-4">Default. Zero-flash SSR + multi-tab apps.</td>
              </tr>
              <tr className="border-t border-token">
                <td className="py-2 pr-4 font-mono">cookie</td>
                <td className="py-2 pr-4">✅</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">SSR apps where cross-tab sync doesn’t matter.</td>
              </tr>
              <tr className="border-t border-token">
                <td className="py-2 pr-4 font-mono">local</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">✅</td>
                <td className="py-2 pr-4">SPAs where the server never renders the theme.</td>
              </tr>
              <tr className="border-t border-token">
                <td className="py-2 pr-4 font-mono">session</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">Temporary, per-tab (forgotten after close).</td>
              </tr>
              <tr className="border-t border-token">
                <td className="py-2 pr-4 font-mono">none</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">forcedTheme or purely in-memory state.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DemoCard>

      <DemoCard
        title="Configure"
        code={`<ThemeProvider
  storage="hybrid"           // 'hybrid' | 'cookie' | 'local' | 'session' | 'none'
  storageKey="theme"          // localStorage / sessionStorage key (and fallback cookie name)
  cookieOptions={{
    name: 'theme',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    secure: true,
    domain: '.example.com',
  }}
>
  {children}
</ThemeProvider>`}
      />
    </div>
  );
}
