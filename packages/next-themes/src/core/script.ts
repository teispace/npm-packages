import type { Attribute, StorageMode } from './types';

export interface ScriptConfig {
  storageMode: StorageMode;
  storageKey: string;
  cookieName: string;
  attribute: Attribute | Attribute[];
  themes: string[];
  defaultTheme: string;
  enableSystem: boolean;
  forcedTheme: string | null;
  initialTheme: string | null;
  value: Record<string, string> | null;
  enableColorScheme: boolean;
  themeColor: string | Record<string, string> | null;
  disableTransitionOnChange: string | null;
  respectReducedMotion: boolean;
  target: string;
}

export interface BuildScriptOptions extends Partial<ScriptConfig> {}

function normalize(opts: BuildScriptOptions): ScriptConfig {
  const storageKey = opts.storageKey ?? 'theme';
  return {
    storageMode: opts.storageMode ?? 'hybrid',
    storageKey,
    cookieName: opts.cookieName ?? storageKey,
    attribute: opts.attribute ?? 'data-theme',
    themes: opts.themes ?? ['light', 'dark'],
    defaultTheme: opts.defaultTheme ?? 'system',
    enableSystem: opts.enableSystem ?? true,
    forcedTheme: opts.forcedTheme ?? null,
    initialTheme: opts.initialTheme ?? null,
    value: opts.value ?? null,
    enableColorScheme: opts.enableColorScheme ?? true,
    themeColor: opts.themeColor ?? null,
    disableTransitionOnChange:
      opts.disableTransitionOnChange === undefined || opts.disableTransitionOnChange === null
        ? null
        : opts.disableTransitionOnChange,
    respectReducedMotion: opts.respectReducedMotion ?? true,
    target: opts.target ?? 'html',
  };
}

/**
 * Build the inline, blocking anti-FOUC script that runs before hydration.
 * Returns a single-line IIFE string; the caller wraps it in a <script> tag.
 *
 * The body is delivered as a function serialized via toString(). Function
 * name artifacts injected by some minifiers (e.g. the esbuild __name helper)
 * are stripped before the script ships to the client.
 */
export function buildScript(opts: BuildScriptOptions): string {
  const c = normalize(opts);
  const attrs = Array.isArray(c.attribute) ? c.attribute : [c.attribute];
  const cfg = {
    a: attrs,
    t: c.themes,
    v: c.value,
    d: c.defaultTheme,
    f: c.forcedTheme,
    i: c.initialTheme,
    m: c.storageMode,
    k: c.storageKey,
    n: c.cookieName,
    s: c.enableSystem ? 1 : 0,
    cs: c.enableColorScheme ? 1 : 0,
    tc: c.themeColor,
    dt: c.disableTransitionOnChange,
    rrm: c.respectReducedMotion ? 1 : 0,
    tg: c.target,
  };
  const body = stripNameArtifacts(themeScript.toString());
  return `!function(){try{(${body})(${JSON.stringify(cfg)})}catch(e){}}();`;
}

/**
 * Strip esbuild/swc `__name(fn,"...")` wrappers that some bundlers inject for
 * stack traces. The script must not reference outer symbols, so these would
 * throw at runtime.
 */
function stripNameArtifacts(src: string): string {
  return src.replace(/__name\(([^,]+),\s*["'][^"']*["']\)/g, '$1');
}

type Cfg = {
  a: string[];
  t: string[];
  v: Record<string, string> | null;
  d: string;
  f: string | null;
  i: string | null;
  m: StorageMode;
  k: string;
  n: string;
  s: 0 | 1;
  cs: 0 | 1;
  tc: string | Record<string, string> | null;
  dt: string | null;
  rrm: 0 | 1;
  tg: string;
};

// This function is serialized to string and embedded inline. It MUST NOT
// reference any outer identifier (imports, module constants) — every value
// it needs is passed in via `c`. Keep identifiers short to minimize payload.
function themeScript(c: Cfg): void {
  const d = document;
  const el = (d.querySelector(c.tg) as HTMLElement | null) || d.documentElement;

  const readCookie = (name: string): string | null => {
    const parts = d.cookie ? d.cookie.split('; ') : [];
    for (let i = 0; i < parts.length; i++) {
      const eq = parts[i].indexOf('=');
      if (eq < 0) continue;
      if (parts[i].substring(0, eq) === name) {
        const raw = parts[i].substring(eq + 1);
        if (!raw) return null;
        try {
          return decodeURIComponent(raw);
        } catch (_e) {
          return raw;
        }
      }
    }
    return null;
  };
  const readLocal = (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch (_e) {
      return null;
    }
  };
  const readSession = (k: string): string | null => {
    try {
      return sessionStorage.getItem(k);
    } catch (_e) {
      return null;
    }
  };

  let theme: string | null = null;
  if (c.f) {
    theme = c.f;
  } else {
    const chain: StorageMode[] =
      c.m === 'hybrid' ? (['cookie', 'local'] as StorageMode[]) : c.m === 'none' ? [] : [c.m];
    for (let x = 0; x < chain.length && !theme; x++) {
      const mm = chain[x];
      if (mm === 'cookie') theme = readCookie(c.n);
      else if (mm === 'local') theme = readLocal(c.k);
      else if (mm === 'session') theme = readSession(c.k);
    }
    if (!theme && c.i) theme = c.i;
    if (!theme) theme = c.d;
  }

  const isSys = theme === 'system' && !!c.s;
  if (!isSys && c.t.indexOf(theme) < 0) theme = c.d;

  let resolved = theme;
  if (isSys) {
    resolved = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else if (theme === 'system') {
    resolved = c.d;
  }

  const applied = c.v && c.v[resolved] != null ? c.v[resolved] : resolved;

  for (let ai = 0; ai < c.a.length; ai++) {
    const a = c.a[ai];
    if (a === 'class') {
      const all: Record<string, 1> = {};
      for (let ti = 0; ti < c.t.length; ti++) {
        const tn = c.t[ti];
        const mv = c.v && c.v[tn] != null ? c.v[tn] : tn;
        const pp = mv.split(/\s+/);
        for (let pi = 0; pi < pp.length; pi++) if (pp[pi]) all[pp[pi]] = 1;
      }
      if (c.s) {
        const sv = c.v && c.v.system != null ? c.v.system : 'system';
        const sp = sv.split(/\s+/);
        for (let pi = 0; pi < sp.length; pi++) if (sp[pi]) all[sp[pi]] = 1;
      }
      for (const k in all) el.classList.remove(k);
      const ap = applied.split(/\s+/);
      for (let pi = 0; pi < ap.length; pi++) if (ap[pi]) el.classList.add(ap[pi]);
    } else {
      el.setAttribute(a, applied);
    }
  }

  if (c.cs && (resolved === 'light' || resolved === 'dark')) {
    el.style.colorScheme = resolved;
  }

  if (c.tc) {
    const col = typeof c.tc === 'string' ? c.tc : c.tc[resolved] || c.tc[theme];
    if (col) {
      let mt = d.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (!mt) {
        mt = d.createElement('meta');
        mt.name = 'theme-color';
        d.head.appendChild(mt);
      }
      mt.setAttribute('content', col);
    }
  }

  if (c.dt) {
    const rm = !!c.rrm && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!rm) {
      const st = d.createElement('style');
      st.appendChild(d.createTextNode(c.dt));
      d.head.appendChild(st);
      if (d.body) void getComputedStyle(d.body).opacity;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          st.remove();
        });
      });
    }
  }
}
