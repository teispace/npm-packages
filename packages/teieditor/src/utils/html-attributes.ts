/**
 * Prepare HTML for an inert parse under a strict CSP.
 *
 * Chromium checks a parsed document against the page's policy even when
 * nothing in it can run (DOMParser, `<template>`, `createHTMLDocument` all
 * alike): every `style` and `on*` attribute files a CSP violation report,
 * and the blocked styles read empty through the CSSOM, so an import that
 * reads `el.style` loses them. Renaming `style` before the parse and
 * dropping handlers avoids both; {@link restoreStyles} puts styles back
 * through the CSSOM, which no policy governs.
 *
 * Only attribute names inside start tags change, found the way the HTML
 * tokenizer finds them; text, comments and attribute values are copied as
 * they are.
 */

/** Where renamed styles wait for {@link restoreStyles}. */
export const STYLE_ATTRIBUTE = 'data-tei-style';

const isSpace = (c: string) => c === ' ' || c === '\n' || c === '\t' || c === '\f' || c === '\r';
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/** Elements whose content is raw text: no tags inside until their end tag. */
const RAW_TEXT = new Set([
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
]);

export function neutralizeAttributes(html: string): string {
  // Fast path: nothing to rename.
  if (!/style|on[a-z]/i.test(html)) return html;
  let out = '';
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    i = lt;
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      const stop = end < 0 ? n : end + 3;
      out += html.slice(i, stop);
      i = stop;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?' || html[i + 1] === '/') {
      // Doctype, bogus comment, or end tag: copied up to its `>`.
      const end = html.indexOf('>', i + 1);
      const stop = end < 0 ? n : end + 1;
      out += html.slice(i, stop);
      i = stop;
      continue;
    }
    if (!isAlpha(html[i + 1] ?? '')) {
      out += '<';
      i++;
      continue;
    }
    // A start tag: name, then attributes.
    let j = i + 1;
    while (j < n && !isSpace(html[j] as string) && html[j] !== '/' && html[j] !== '>') j++;
    const tag = html.slice(i + 1, j).toLowerCase();
    out += html.slice(i, j);
    while (j < n && html[j] !== '>') {
      const c = html[j] as string;
      if (isSpace(c) || c === '/') {
        out += c;
        j++;
        continue;
      }
      // Attribute name: up to space, `/`, `>` or `=` (a leading `=` belongs to it).
      let k = j + 1;
      while (
        k < n &&
        !isSpace(html[k] as string) &&
        html[k] !== '/' &&
        html[k] !== '>' &&
        html[k] !== '='
      )
        k++;
      const name = html.slice(j, k);
      // Optional value.
      let v = k;
      while (v < n && isSpace(html[v] as string)) v++;
      let end = k;
      if (html[v] === '=') {
        v++;
        while (v < n && isSpace(html[v] as string)) v++;
        const quote = html[v];
        if (quote === '"' || quote === "'") {
          const close = html.indexOf(quote, v + 1);
          end = close < 0 ? n : close + 1;
        } else {
          end = v;
          while (end < n && !isSpace(html[end] as string) && html[end] !== '>') end++;
        }
      }
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) {
        // Dropped: handlers never reach a document.
      } else if (lower === 'style') {
        out += STYLE_ATTRIBUTE + html.slice(k, end);
      } else {
        out += html.slice(j, end);
      }
      j = end;
    }
    if (j < n) {
      out += '>';
      j++;
    }
    i = j;
    if (RAW_TEXT.has(tag)) {
      // Copy raw text untouched up to the matching end tag.
      const close = html.toLowerCase().indexOf(`</${tag}`, i);
      const stop = close < 0 ? n : close;
      out += html.slice(i, stop);
      i = stop;
    }
  }
  return out;
}

/** Put renamed styles back, through the CSSOM. */
export function restoreStyles(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${STYLE_ATTRIBUTE}]`))) {
    const css = el.getAttribute(STYLE_ATTRIBUTE) ?? '';
    el.removeAttribute(STYLE_ATTRIBUTE);
    if (el.style) el.style.cssText = css;
  }
}
