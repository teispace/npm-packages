/**
 * URL checks for everything the editor turns into an `href` or a `src`.
 *
 * Content reaches the editor from places nobody controls — pasted HTML, a JSON
 * document saved by an older version, a collaborator — so a URL is checked
 * where a node is created, and a refused one never reaches the DOM or an
 * export. The check is an allowlist of schemes, applied to the URL the way a
 * browser would read it.
 */

/** Schemes a link may use. */
export const LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:'];

/** Schemes an image may load from; `data:image/*` is allowed separately. */
export const IMAGE_PROTOCOLS: readonly string[] = ['http:', 'https:', 'blob:'];

/** Schemes a file attachment may point at; `data:` is allowed separately. */
export const FILE_PROTOCOLS: readonly string[] = ['http:', 'https:', 'blob:'];

export interface SafeUrlOptions {
  /** Allowed schemes, lower-case with the colon. Default: {@link LINK_PROTOCOLS}. */
  protocols?: readonly string[];
  /**
   * Allow a reference with no scheme — `/docs`, `#intro`, `page.html`. It
   * resolves against the page, so it cannot change the scheme. A
   * protocol-relative `//host` is never allowed: it leaves the site. Default: true.
   */
  allowRelative?: boolean;
  /**
   * Allow `data:` URLs whose media type passes this test. Images use it for
   * pasted and uploaded pictures, which the editor stores as data URLs.
   */
  allowData?: (mediaType: string) => boolean;
}

// Browsers drop ASCII tab and newline anywhere in a URL and C0 controls and
// spaces at either end, so `java\tscript:` is `javascript:`. Every C0 control
// is removed here, wherever it is: refusing slightly more than a browser
// would is the safe direction.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const CONTROL = /[\u0000-\u001F\u007F]/g;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** The URL as a browser would read it, for checking. */
const clean = (url: string): string => url.replace(CONTROL, '').trim();

/**
 * Whether a URL is safe to put in an `href` or `src`.
 *
 * Refuses `javascript:`, `vbscript:`, `data:` (unless {@link SafeUrlOptions.allowData}
 * says otherwise), protocol-relative `//host`, and anything else outside the
 * allowlist — in any case, with control characters or whitespace hidden
 * inside the scheme.
 *
 * @example
 * isSafeUrl('https://example.com');      // true
 * isSafeUrl('JaVaScRiPt:alert(1)');      // false
 * isSafeUrl('java\tscript:alert(1)');    // false
 * isSafeUrl('//evil.example');           // false
 */
export function isSafeUrl(url: string, options: SafeUrlOptions = {}): boolean {
  if (typeof url !== 'string') return false;
  const { protocols = LINK_PROTOCOLS, allowRelative = true, allowData } = options;
  const value = clean(url);
  if (!value) return false;

  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    // A backslash is a slash to the URL parser, so `/\host` is `//host`.
    return allowRelative && !value.replace(/\\/g, '/').startsWith('//');
  }

  if (scheme === 'data') {
    if (!allowData) return false;
    const mediaType = value.slice(5).split(/[;,]/, 1)[0].trim().toLowerCase();
    return allowData(mediaType);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return protocols.includes(parsed.protocol);
}

/**
 * The URL itself when {@link isSafeUrl} accepts it, otherwise `fallback`
 * (`about:blank` by default — inert wherever it lands).
 */
export function safeUrl(url: string, options?: SafeUrlOptions, fallback = 'about:blank'): string {
  return isSafeUrl(url, options) ? url.trim() : fallback;
}

/** Images: http(s), blob previews, and `data:image/*` from paste and upload. */
export function isSafeImageSrc(src: string): boolean {
  return isSafeUrl(src, {
    protocols: IMAGE_PROTOCOLS,
    allowData: (type) => type.startsWith('image/'),
  });
}

/**
 * Media types a browser would run script from when navigated to. A file
 * attachment's `data:` URL may be anything else — a PDF, an archive — since
 * uploads without a handler are stored inline.
 */
const SCRIPTABLE = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
  'text/javascript',
  'application/javascript',
]);

/** File attachments: http(s), blob, and `data:` that cannot run script. */
export function isSafeFileUrl(url: string): boolean {
  return isSafeUrl(url, {
    protocols: FILE_PROTOCOLS,
    allowData: (type) => !SCRIPTABLE.has(type),
  });
}

/**
 * What the user typed into a link field, made into a URL: a bare host such as
 * `example.com` gets `https://`; anything with a scheme or a leading `/`, `#`
 * or `?` is kept as typed, for {@link isSafeUrl} to accept or refuse. Unlike
 * prefixing every unrecognised input, `javascript:alert(1)` stays recognisable
 * as what it is rather than becoming `https://javascript:alert(1)`.
 */
export function withDefaultScheme(input: string): string {
  const value = input.trim();
  if (!value || /^[/#?]/.test(value)) return value;
  const cleaned = clean(value);
  const scheme = SCHEME.exec(cleaned);
  if (scheme) {
    // `example.com:8080` and `localhost:3000` read as a scheme to the regex,
    // but a host-shaped name followed by a port is a host.
    const name = scheme[1].toLowerCase();
    const port = /^\d+(?:[/?#]|$)/.test(cleaned.slice(scheme[0].length));
    if (!(port && (name.includes('.') || name === 'localhost'))) return value;
  }
  return `https://${value}`;
}
