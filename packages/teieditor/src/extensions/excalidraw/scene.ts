/**
 * A drawing's data, checked: the scene Excalidraw edits, and the SVG
 * preview the page shows. Both come from places nobody controls (saved
 * JSON, pasted HTML), so each is read field by field and anything odd is
 * dropped or refused, never passed on.
 */

/** An Excalidraw element: kept as Excalidraw wrote it, past a check of its shape. */
export type ExcalidrawElement = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly type: string;
};

/** An image an element shows, as a `data:image/*` URL. */
export interface ExcalidrawFile {
  readonly id: string;
  readonly mimeType: string;
  readonly dataURL: string;
  readonly created?: number;
}

export interface ExcalidrawScene {
  readonly elements: readonly ExcalidrawElement[];
  readonly files: Readonly<Record<string, ExcalidrawFile>>;
}

/** The most a scene may hold, as JSON: 5 MB. */
export const MAX_SCENE_SIZE = 5 * 1024 * 1024;
/** The largest preview, as a `data:` URL: 2 MB. */
export const MAX_PREVIEW_SIZE = 2 * 1024 * 1024;
/** The most elements a scene may have. */
export const MAX_ELEMENTS = 20_000;

export const EMPTY_SCENE: ExcalidrawScene = Object.freeze({
  elements: Object.freeze([]) as readonly ExcalidrawElement[],
  files: Object.freeze({}),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Image types Excalidraw shows, as `data:` URLs (no SVG: it is a document, not a picture). */
const FILE_DATA = /^data:image\/(png|jpeg|gif|webp|avif|bmp|x-icon);base64,[A-Za-z0-9+/]+=*$/;

function cleanFile(id: string, value: unknown): ExcalidrawFile | null {
  if (!isRecord(value)) return null;
  const { mimeType, dataURL, created } = value;
  if (typeof mimeType !== 'string' || typeof dataURL !== 'string') return null;
  if (!FILE_DATA.test(dataURL)) return null;
  const file: { -readonly [K in keyof ExcalidrawFile]: ExcalidrawFile[K] } = {
    id,
    mimeType,
    dataURL,
  };
  if (typeof created === 'number' && Number.isFinite(created)) file.created = created;
  return file;
}

/**
 * A scene from anything: elements with an `id` and a `type` (deleted ones
 * left out), and the image files they use. `null` for what is not a scene
 * at all, or is bigger than `maxSize` bytes of JSON.
 */
export function cleanScene(input: unknown, maxSize = MAX_SCENE_SIZE): ExcalidrawScene | null {
  if (!isRecord(input) || !Array.isArray(input.elements)) return null;
  if (input.elements.length > MAX_ELEMENTS) return null;
  const elements = input.elements.filter(
    (el): el is ExcalidrawElement =>
      isRecord(el) &&
      typeof el.id === 'string' &&
      typeof el.type === 'string' &&
      el.isDeleted !== true,
  );
  const used = new Set(
    elements.flatMap((el) => (typeof el.fileId === 'string' ? [el.fileId] : [])),
  );
  const files: Record<string, ExcalidrawFile> = {};
  if (isRecord(input.files)) {
    for (const id of used) {
      const file = Object.hasOwn(input.files, id) ? cleanFile(id, input.files[id]) : null;
      if (file) files[id] = file;
    }
  }
  const scene = { elements, files };
  let size: number;
  try {
    size = JSON.stringify(scene).length;
  } catch {
    return null;
  }
  return size <= maxSize ? scene : null;
}

/** A scene from JSON text; `null` for text that is not one. */
export function parseScene(text: unknown, maxSize = MAX_SCENE_SIZE): ExcalidrawScene | null {
  if (typeof text !== 'string' || text.length > maxSize) return null;
  try {
    return cleanScene(JSON.parse(text), maxSize);
  } catch {
    return null;
  }
}

// -- The preview --------------------------------------------------------------

const PREVIEW = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/]+=*)$/;

/** What no drawing's SVG needs and a hostile one would: script, outside content, handlers, links out. */
const UNSAFE_SVG =
  /<\s*(?:script|foreignObject|iframe|object|embed|animate|set|handler)\b|<[^>]*\son[a-z]+\s*=|<[^>]*\s(?:xlink:)?href\s*=(?![\s"']*(?:#|data:image\/(?:png|jpeg|gif|webp|avif);))|<[^>]*=\s*["']?\s*javascript:/i;

/** UTF-8 text from base64. */
function decodeBase64(data: string): string | null {
  try {
    const binary = atob(data);
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/**
 * A preview as an `<img>` may show it: an SVG `data:` URL no bigger than
 * {@link MAX_PREVIEW_SIZE}, that is an SVG, with nothing in it that runs or
 * loads (an `<img>` would ignore both; the check keeps them out of saved
 * HTML too). Anything else is `null`.
 */
export function cleanPreview(src: unknown): string | null {
  if (typeof src !== 'string' || src.length > MAX_PREVIEW_SIZE) return null;
  const match = PREVIEW.exec(src);
  if (!match) return null;
  const svg = decodeBase64(match[1] ?? '');
  if (svg === null || !/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return null;
  return UNSAFE_SVG.test(svg) ? null : src;
}

const UNSAFE_TAGS = 'script,foreignObject,iframe,object,embed,animate,set,handler';
const SAFE_HREF = /^\s*(#|data:image\/(?:png|jpeg|gif|webp|avif);)/i;

/**
 * Make an exported SVG pass {@link cleanPreview}: take out what runs or
 * loads, and unwrap links (Excalidraw draws an element's link as `<a>`).
 */
export function sanitizeSvg(svg: Element): void {
  for (const el of Array.from(svg.querySelectorAll(UNSAFE_TAGS))) el.remove();
  for (const link of Array.from(svg.querySelectorAll('a'))) link.replaceWith(...link.childNodes);
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    for (const { name, value } of Array.from(el.attributes)) {
      const unsafe =
        /^on/i.test(name) ||
        /javascript:/i.test(value) ||
        (/(^|:)href$/i.test(name) && !SAFE_HREF.test(value));
      if (unsafe) el.removeAttribute(name);
    }
  }
}

/** SVG markup as a `data:` URL, base64 of its UTF-8. */
export function svgDataURL(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
