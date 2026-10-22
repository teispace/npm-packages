import { DISABLE_TRANSITION_CSS } from './dom';
import type { Attribute, StorageMode } from './types';

export interface ScriptConfig {
  storageMode: StorageMode;
  storageKey: string;
  cookieName: string;
  attribute: Attribute | Attribute[];
  themes: string[];
  defaultTheme: string;
  enableSystem: boolean;
  /**
   * Always use the system preference, ignoring any stored theme value.
   * When true, the script behaves as if `theme: 'system'` is selected on
   * every load, regardless of what is in the cookie / localStorage.
   * Mirrors the React provider's `followSystem` prop.
   */
  followSystem: boolean;
  forcedTheme: string | null;
  initialTheme: string | null;
  value: Record<string, string> | null;
  enableColorScheme: boolean;
  themeColor: string | Record<string, string> | null;
  /** CSS injected while the theme is applied, or `null` to leave transitions alone. */
  disableTransitionOnChange: string | null;
  respectReducedMotion: boolean;
  target: string;
}

export interface BuildScriptOptions
  extends Partial<Omit<ScriptConfig, 'disableTransitionOnChange'>> {
  /** `true` for the built-in transition-disabling CSS, a string for custom CSS. */
  disableTransitionOnChange?: boolean | string | null;
}

/**
 * The attribute the constant {@link THEME_SCRIPT} reads its configuration from.
 */
export const THEME_SCRIPT_ATTRIBUTE = 'data-teispace-theme';

function normalize(opts: BuildScriptOptions): ScriptConfig {
  const storageKey = opts.storageKey ?? 'theme';
  const dt = opts.disableTransitionOnChange;
  return {
    storageMode: opts.storageMode ?? 'hybrid',
    storageKey,
    cookieName: opts.cookieName ?? storageKey,
    attribute: opts.attribute ?? 'data-theme',
    themes: opts.themes ?? ['light', 'dark'],
    defaultTheme: opts.defaultTheme ?? 'system',
    enableSystem: opts.enableSystem ?? true,
    followSystem: opts.followSystem ?? false,
    forcedTheme: opts.forcedTheme ?? null,
    initialTheme: opts.initialTheme ?? null,
    value: opts.value ?? null,
    enableColorScheme: opts.enableColorScheme ?? true,
    themeColor: opts.themeColor ?? null,
    disableTransitionOnChange: dt === true ? DISABLE_TRANSITION_CSS : dt || null,
    respectReducedMotion: opts.respectReducedMotion ?? true,
    target: opts.target ?? 'html',
  };
}

/** The compact config object the script body reads as `c`. */
function compact(opts: BuildScriptOptions) {
  const c = normalize(opts);
  return {
    a: Array.isArray(c.attribute) ? c.attribute : [c.attribute],
    t: c.themes,
    v: c.value,
    d: c.defaultTheme,
    f: c.forcedTheme,
    i: c.initialTheme,
    m: c.storageMode,
    k: c.storageKey,
    n: c.cookieName,
    s: c.enableSystem ? 1 : 0,
    fs: c.followSystem ? 1 : 0,
    cs: c.enableColorScheme ? 1 : 0,
    tc: c.themeColor,
    dt: c.disableTransitionOnChange,
    rrm: c.respectReducedMotion ? 1 : 0,
    tg: c.target,
  };
}

/**
 * Build the inline anti-FOUC script with its configuration baked into the
 * script text.
 *
 * Because the text varies with the configuration, a hash-based CSP needs a
 * separate hash per configuration. Prefer {@link THEME_SCRIPT} with
 * {@link getScriptConfig} (what the providers render): its text never changes,
 * so the single {@link THEME_SCRIPT_HASH} covers every app.
 */
export function buildScript(opts: BuildScriptOptions): string {
  return `!function(){try{var s=document.currentScript,c=${safeJson(compact(opts))};${SCRIPT_BODY}}catch(e){}}();`;
}

/**
 * The configuration for {@link THEME_SCRIPT}, serialized for the
 * {@link THEME_SCRIPT_ATTRIBUTE} attribute. React escapes attribute values, so
 * no extra HTML escaping is needed here.
 */
export function getScriptConfig(opts: BuildScriptOptions): string {
  return JSON.stringify(compact(opts));
}

/**
 * `JSON.stringify` does not escape sequences that would prematurely close
 * an inline `<script>` tag or break the parser. A `forcedTheme`,
 * `themeColor`, `value` map, or `disableTransitionOnChange` CSS string
 * sourced from user input could otherwise contain literal `</script>` and
 * break out of the tag — XSS via the same surface reported as upstream
 * issue #213. U+2028 / U+2029 are valid JSON whitespace but invalid in
 * JS string literals and would crash the script.
 *
 * The escapes are equivalent in JS-string semantics (the runtime value is
 * unchanged), so the script behaves identically with or without them.
 */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * The script body. Written as a single raw string so bundlers can never
 * insert `__name(...)` wrappers, rename identifiers, or otherwise rewrite
 * what ships to the browser. Identifiers inside reference `c` (the config),
 * `s` (the running `<script>` element) and globals only.
 *
 * Behaviors:
 *   1. Resolve theme: forced → cookie → local → session → initial → default,
 *      normalized exactly as the store's `normalizeSelection` does.
 *   2. Coerce `'system'` to a concrete theme based on `prefers-color-scheme`.
 *   3. Apply attribute(s) and `color-scheme` on the target element.
 *   4. Set `<meta name="theme-color">` if requested.
 *   5. Disable transitions while applying, if requested. The CSS goes in a
 *      constructable stylesheet, which a strict `style-src` CSP does not
 *      block, falling back to a `<style>` carrying the script's own nonce.
 *   6. Re-run on `pageshow` when restored from bfcache (event.persisted).
 */
const SCRIPT_BODY = [
  'var d=document,nn=s&&s.nonce;',
  'function mq(q){try{return matchMedia(q).matches}catch(_){return false}}',
  "function ok(v){return v==='system'?!!c.s:c.t.indexOf(v)>=0}",
  'function cl(v){return String(v).split(/\\s+/).filter(Boolean)}',
  'function mp(v){return c.v&&c.v[v]!=null?c.v[v]:v}',
  'function rc(n){',
  'var p=d.cookie?d.cookie.split(/;\\s*/):[];',
  'for(var i=0;i<p.length;i++){',
  "var e=p[i].indexOf('=');",
  'if(e>0&&p[i].substring(0,e)===n){',
  'var r=p[i].substring(e+1);',
  'if(!r)return null;',
  'try{return decodeURIComponent(r)}catch(_){return r}',
  '}',
  '}',
  'return null;',
  '}',
  'function rw(k,n){try{return window[k].getItem(n)}catch(_){return null}}',
  'function rt(){',
  'var el=d.documentElement;',
  'try{var f=d.querySelector(c.tg);if(f)el=f}catch(_){}',
  'var t=null;',
  'if(c.f)t=c.f;',
  "else if(c.fs&&c.s)t='system';",
  'else{',
  "var ch=c.m==='hybrid'?['cookie','local']:c.m==='none'?[]:[c.m];",
  'for(var x=0;x<ch.length;x++){',
  "var sv=ch[x]==='cookie'?rc(c.n):rw(ch[x]+'Storage',c.k);",
  'if(sv){if(ok(sv))t=sv;break}',
  '}',
  'if(!t)t=c.i||c.d;',
  '}',
  "if(!ok(t))t=ok(c.d)?c.d:(c.t[0]||'light');",
  "var rv=t==='system'?(mq('(prefers-color-scheme: dark)')?'dark':'light'):t;",
  'var ap=mp(rv),chg=0;',
  'for(var ai=0;ai<c.a.length;ai++){',
  'var a=c.a[ai];',
  "if(a==='class'){",
  "var w=cl(ap),al=c.s?c.t.concat(['system']):c.t;",
  'for(var i=0;i<al.length;i++){',
  'var o=cl(mp(al[i]));',
  'for(var j=0;j<o.length;j++)if(w.indexOf(o[j])<0&&el.classList.contains(o[j])){el.classList.remove(o[j]);chg=1}',
  '}',
  'for(var k=0;k<w.length;k++)if(!el.classList.contains(w[k])){el.classList.add(w[k]);chg=1}',
  '}else if(el.getAttribute(a)!==ap){el.setAttribute(a,ap);chg=1}',
  '}',
  "if(c.cs&&(rv==='light'||rv==='dark')&&el.style.colorScheme!==rv)el.style.colorScheme=rv;",
  'if(c.tc){',
  "var col=typeof c.tc==='string'?c.tc:(c.tc[rv]||c.tc[t]);",
  'if(col){',
  'var mt=d.querySelector(\'meta[name="theme-color"][data-teispace-themes]\');',
  "if(!mt){mt=d.createElement('meta');mt.name='theme-color';mt.setAttribute('data-teispace-themes','');d.head.appendChild(mt)}",
  "if(mt.getAttribute('content')!==col)mt.setAttribute('content',col);",
  '}',
  '}',
  "if(c.dt&&chg&&!(c.rrm&&mq('(prefers-reduced-motion: reduce)'))){",
  'var rm;',
  'try{',
  'var as=d.adoptedStyleSheets,sh=new CSSStyleSheet();',
  'if(!as)throw 0;',
  'sh.replaceSync(c.dt);',
  'd.adoptedStyleSheets=as.concat([sh]);',
  'rm=function(){d.adoptedStyleSheets=[].filter.call(d.adoptedStyleSheets,function(y){return y!==sh})};',
  '}catch(_){',
  "var st=d.createElement('style');",
  "st.setAttribute('data-teispace-themes','');",
  'if(nn)st.nonce=nn;',
  'st.appendChild(d.createTextNode(c.dt));',
  'd.head.appendChild(st);',
  'rm=function(){st.remove()};',
  '}',
  'if(d.body)void getComputedStyle(d.body).opacity;',
  'var dn=0,rmv=function(){if(!dn){dn=1;rm()}},tm=setTimeout(rmv,120);',
  'requestAnimationFrame(function(){requestAnimationFrame(function(){clearTimeout(tm);rmv()})});',
  '}',
  '}',
  'rt();',
  "addEventListener('pageshow',function(e){if(e.persisted)rt()});",
  // One line per statement keeps the source readable; joining with no
  // separator ships it without indentation.
].join('');

/**
 * The anti-FOUC script with a constant text: it reads its configuration from
 * the {@link THEME_SCRIPT_ATTRIBUTE} attribute of its own `<script>` element.
 *
 * Because the text never varies, one hash ({@link THEME_SCRIPT_HASH}) allows it
 * under a hash-based CSP for every configuration and every request — no nonce,
 * and so no forced dynamic rendering.
 */
export const THEME_SCRIPT = `!function(){try{var s=document.currentScript,c=JSON.parse(s.getAttribute("${THEME_SCRIPT_ATTRIBUTE}"));${SCRIPT_BODY}}catch(e){}}();`;

/**
 * The CSP source expression for {@link THEME_SCRIPT}, ready to drop into
 * `script-src`. A test recomputes it from the script text, so it cannot go
 * stale.
 */
export const THEME_SCRIPT_HASH = "'sha256-0Z+segUWHZKpr3q+brt3vfTksotAe74NTii229eX9OA='";
