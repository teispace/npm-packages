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
    followSystem: opts.followSystem ?? false,
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
 * Build the inline anti-FOUC script.
 *
 * The script body is a raw string literal — NOT a serialized function. This
 * is intentional: bundlers (esbuild, swc) inject `__name(fn,"name")` wrappers
 * around named functions when `keepNames` is on, which crashes any
 * deserialized function body that lacks a global `__name`. Storing the body
 * as data means no bundler ever rewrites it.
 *
 * The body also self-rebinds via `pageshow` so theme is re-applied when a
 * page is restored from the browser back/forward cache — bfcache snapshots
 * the DOM at navigation time, and storage may have changed in another tab.
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
    fs: c.followSystem ? 1 : 0,
    cs: c.enableColorScheme ? 1 : 0,
    tc: c.themeColor,
    dt: c.disableTransitionOnChange,
    rrm: c.respectReducedMotion ? 1 : 0,
    tg: c.target,
  };
  return `!function(){try{var c=${safeJson(cfg)};${SCRIPT_BODY}}catch(e){}}();`;
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
 * what ships to the browser. Identifiers inside reference `c` (the inlined
 * config object) and globals only.
 *
 * Behaviors:
 *   1. Resolve theme: forced → cookie → local → session → initial → default.
 *   2. Coerce `'system'` to a concrete theme based on `prefers-color-scheme`.
 *   3. Apply attribute(s) and `color-scheme` style on the target element.
 *   4. Set `<meta name="theme-color">` if requested.
 *   5. Inject a transient transition-disable `<style>` if requested.
 *   6. Re-run on `pageshow` when restored from bfcache (event.persisted).
 */
const SCRIPT_BODY = `
var d=document;
function rt(){
  var el=d.documentElement;
  try{var f=d.querySelector(c.tg);if(f)el=f;}catch(_){}
  function rc(n){
    var p=d.cookie?d.cookie.split('; '):[];
    for(var i=0;i<p.length;i++){
      var e=p[i].indexOf('=');
      if(e<0)continue;
      if(p[i].substring(0,e)===n){
        var r=p[i].substring(e+1);
        if(!r)return null;
        try{return decodeURIComponent(r);}catch(_){return r;}
      }
    }
    return null;
  }
  function rl(k){try{return localStorage.getItem(k);}catch(_){return null;}}
  function rs(k){try{return sessionStorage.getItem(k);}catch(_){return null;}}
  var t=null;
  if(c.f){t=c.f;}
  else if(c.fs&&c.s){t='system';}
  else{
    var ch=c.m==='hybrid'?['cookie','local']:c.m==='none'?[]:[c.m];
    for(var x=0;x<ch.length&&!t;x++){
      var mm=ch[x];
      if(mm==='cookie')t=rc(c.n);
      else if(mm==='local')t=rl(c.k);
      else if(mm==='session')t=rs(c.k);
    }
    if(!t&&c.i)t=c.i;
    if(!t)t=c.d;
  }
  var sa=!!c.s;
  if(t==='system'&&!sa)t=c.d;
  if(t!=='system'&&c.t.indexOf(t)<0)t=c.d;
  if(t==='system'&&!sa)t=c.t[0]||'light';
  var rv=t;
  if(t==='system'){rv=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
  var ap=c.v&&c.v[rv]!=null?c.v[rv]:rv;

  var changed=false;
  for(var ai=0;ai<c.a.length;ai++){
    var a=c.a[ai];
    if(a==='class'){
      var all={};
      for(var ti=0;ti<c.t.length;ti++){
        var tn=c.t[ti];
        var mv=c.v&&c.v[tn]!=null?c.v[tn]:tn;
        var pp=mv.split(/\\s+/);
        for(var pi=0;pi<pp.length;pi++)if(pp[pi])all[pp[pi]]=1;
      }
      if(c.s){
        var sv=c.v&&c.v.system!=null?c.v.system:'system';
        var sp=sv.split(/\\s+/);
        for(var pi2=0;pi2<sp.length;pi2++)if(sp[pi2])all[sp[pi2]]=1;
      }
      var apl=ap.split(/\\s+/);
      for(var pi3=0;pi3<apl.length;pi3++)if(apl[pi3])delete all[apl[pi3]];
      for(var k in all)if(el.classList.contains(k)){el.classList.remove(k);changed=true;}
      for(var pi4=0;pi4<apl.length;pi4++){
        if(apl[pi4]&&!el.classList.contains(apl[pi4])){
          el.classList.add(apl[pi4]);changed=true;
        }
      }
    }else{
      if(el.getAttribute(a)!==ap){el.setAttribute(a,ap);changed=true;}
    }
  }

  if(c.cs&&(rv==='light'||rv==='dark')){
    if(el.style.colorScheme!==rv)el.style.colorScheme=rv;
  }

  if(c.tc){
    var col=typeof c.tc==='string'?c.tc:(c.tc[rv]||c.tc[t]);
    if(col){
      var mt=d.querySelector('meta[name="theme-color"]');
      if(!mt){mt=d.createElement('meta');mt.name='theme-color';d.head.appendChild(mt);}
      if(mt.getAttribute('content')!==col)mt.setAttribute('content',col);
    }
  }

  if(c.dt&&changed){
    var rm=!!c.rrm&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!rm){
      var st=d.createElement('style');
      st.appendChild(d.createTextNode(c.dt));
      d.head.appendChild(st);
      if(d.body)void getComputedStyle(d.body).opacity;
      requestAnimationFrame(function(){requestAnimationFrame(function(){st.remove();});});
    }
  }
}
rt();
addEventListener('pageshow',function(e){if(e.persisted)rt();});
`
  // Collapse whitespace for a smaller payload. Keep this dumb — just
  // newlines and indentation, never inside string literals.
  .replace(/\n\s*/g, '');
