/** Elements with no closing tag. */
const VOID = new Set([
  'area',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'source',
  'track',
  'wbr',
]);
/** Elements whose text must stay as it is. */
const PRE = new Set(['pre', 'textarea', 'script', 'style']);
/** Elements that start their own line. */
const BLOCK =
  /^(address|article|aside|blockquote|body|caption|colgroup|dd|details|dialog|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)$/;

/** Whether any child starts its own line: if not, the element stays on one. */
const hasBlockChild = (el: Element) =>
  Array.from(el.children).some((child) => BLOCK.test(child.localName));

/**
 * HTML for reading: two spaces a level, each block on its own line, inline
 * content left as it is. Parsed in a `<template>`, which runs nothing and
 * applies nothing, so it is safe for any HTML and quiet under a strict CSP.
 */
export function indentHTML(html: string): string {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  // An element's own tags, from a shallow copy in another inert template.
  const tags = (el: Element): string => {
    const holder = document.createElement('template');
    holder.content.append(el.cloneNode(false));
    return holder.innerHTML;
  };
  const text = (node: Node): string => {
    const holder = document.createElement('template');
    holder.content.append(node.cloneNode(false));
    return holder.innerHTML.replace(/\s+/g, ' ').trim();
  };
  const lines: string[] = [];
  const walk = (node: Node, depth: number) => {
    const pad = '  '.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE) {
      const shown = text(node);
      if (shown) lines.push(pad + shown);
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.localName;
    if (PRE.has(tag) || !hasBlockChild(node)) {
      lines.push(pad + node.outerHTML);
      return;
    }
    const own = tags(node);
    const close = VOID.has(tag) ? '' : `</${tag}>`;
    lines.push(pad + (close ? own.slice(0, own.length - close.length) : own));
    for (const child of Array.from(node.childNodes)) walk(child, depth + 1);
    if (close) lines.push(pad + close);
  };
  for (const child of Array.from(template.content.childNodes)) walk(child, 0);
  return lines.join('\n');
}
