/**
 * TeX to MathML through KaTeX, safe under a strict Content Security Policy:
 * KaTeX's MathML output carries no style attributes and needs no
 * stylesheet or fonts (the browser draws it), and whatever comes out is
 * checked against an allowlist before it reaches the page.
 */

/** What the editor uses of KaTeX: its `render`. The `katex` module is one. */
export interface KatexLike {
  render: (tex: string, element: HTMLElement, options?: Record<string, unknown>) => void;
}

/** Where KaTeX comes from: the module itself, or a function that loads it. */
export type KatexSource =
  | KatexLike
  | (() => Promise<KatexLike | { default: KatexLike }>)
  | null
  | false;

/**
 * KaTeX's options, fixed: MathML only, untrusted (no `\href`, `\url`,
 * `\htmlClass` or `\includegraphics`), and bounded, so no input can make
 * a huge box or expand macros for ever. Errors throw, to be shown our way.
 */
export const KATEX_OPTIONS = {
  output: 'mathml',
  throwOnError: true,
  trust: false,
  strict: 'ignore',
  maxSize: 20,
  maxExpand: 1000,
  globalGroup: false,
} as const;

const isKatex = (value: unknown): value is KatexLike =>
  typeof (value as KatexLike | null)?.render === 'function';

/** KaTeX once it has loaded, shared by every editor on the page. */
let loaded: KatexLike | null = null;
const loading = new WeakMap<object, Promise<KatexLike | null>>();

/** KaTeX if it is at hand now: given as a module, or loaded before. */
export function katexNow(source: KatexSource | undefined): KatexLike | null {
  if (isKatex(source)) return source;
  return source === null || source === false ? null : loaded;
}

/** Load KaTeX from `source`, once; `null` when there is none or it fails to load. */
export function loadKatex(source: KatexSource | undefined): Promise<KatexLike | null> {
  if (isKatex(source)) return Promise.resolve(source);
  if (typeof source !== 'function') return Promise.resolve(null);
  let promise = loading.get(source);
  if (!promise) {
    promise = source().then(
      (module) => {
        const katex = isKatex(module) ? module : (module as { default?: unknown }).default;
        if (!isKatex(katex)) return null;
        loaded = katex;
        return katex;
      },
      () => null,
    );
    loading.set(source, promise);
  }
  return promise;
}

// -- What may come out --------------------------------------------------------

const MATHML_TAGS = new Set(
  (
    'math semantics annotation annotation-xml mrow mi mn mo ms mtext mspace msup msub ' +
    'msubsup mfrac msqrt mroot mstyle mpadded mphantom mover munder munderover mtable ' +
    'mtr mtd mlabeledtr menclose merror mmultiscripts mprescripts none maction'
  ).split(' '),
);

const MATHML_ATTRIBUTES = new Set(
  (
    'display displaystyle scriptlevel mathvariant mathcolor mathbackground mathsize ' +
    'encoding fence stretchy symmetric largeop movablelimits accent accentunder separator ' +
    'lspace rspace minsize maxsize width height depth voffset linethickness columnalign ' +
    'rowalign columnspacing rowspacing columnlines rowlines frame framespacing equalrows ' +
    'equalcolumns notation form align side rowspan columnspan xmlns'
  ).split(' '),
);

/**
 * Keep only MathML, with presentation attributes: no `style`, no event
 * handlers, no `href` (Firefox follows one on any MathML element). An
 * element that is not MathML leaves its text behind.
 */
export function sanitizeMath(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    // Gone with an element replaced before it.
    if (!root.contains(el)) continue;
    const name = el.localName.toLowerCase();
    // KaTeX's wrapper round the `<math>`.
    const wrapper = name === 'span' && el.parentNode === root;
    if (!wrapper && !MATHML_TAGS.has(name)) {
      el.replaceWith(el.ownerDocument.createTextNode(el.textContent ?? ''));
      continue;
    }
    for (const { name: attr } of Array.from(el.attributes)) {
      const keep = wrapper ? attr === 'class' : MATHML_ATTRIBUTES.has(attr.toLowerCase());
      if (!keep) el.removeAttribute(attr);
    }
  }
}

/** Why KaTeX refused the TeX, in a line. */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^KaTeX parse error:\s*/, '').slice(0, 300);
}

/**
 * `tex` as sanitized MathML in a fresh `<span class="katex">`, or why it
 * cannot be: KaTeX refused it, or there is no KaTeX.
 */
export function renderMath(
  katex: KatexLike | null,
  tex: string,
  display: boolean,
  doc: Document,
): { element: HTMLElement; error: null } | { element: null; error: string | null } {
  if (!katex) return { element: null, error: null };
  const box = doc.createElement('span');
  try {
    katex.render(tex, box, { ...KATEX_OPTIONS, displayMode: display });
  } catch (error) {
    return { element: null, error: reason(error) };
  }
  sanitizeMath(box);
  const element = box.firstElementChild as HTMLElement | null;
  if (!element) return { element: null, error: null };
  return { element, error: null };
}

/**
 * Fill `target` with the equation: MathML when KaTeX is at hand and
 * accepts it, else the TeX itself in a `<code>`, marked with KaTeX's
 * complaint if it had one. Built from DOM calls only. Returns the error.
 */
export function paintMath(
  target: HTMLElement,
  katex: KatexLike | null,
  tex: string,
  display: boolean,
): string | null {
  const doc = target.ownerDocument;
  const { element, error } = tex
    ? renderMath(katex, tex, display, doc)
    : { element: null, error: null };
  if (element) {
    target.replaceChildren(element);
    target.removeAttribute('data-error');
    target.removeAttribute('title');
    return null;
  }
  if (!tex) {
    target.replaceChildren();
  } else {
    const code = doc.createElement('code');
    code.textContent = tex;
    target.replaceChildren(code);
  }
  if (error) {
    target.setAttribute('data-error', '');
    target.setAttribute('title', error);
  } else {
    target.removeAttribute('data-error');
    target.removeAttribute('title');
  }
  return error;
}
