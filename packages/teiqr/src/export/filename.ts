/** Reduce arbitrary text to a safe, predictable download filename stem. */
export const sanitizeFilename = (input: string): string => {
  const cleaned = input
    .normalize('NFKD')
    // Strip combining marks so accented characters degrade rather than vanish.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return cleaned || 'qr-code';
};
