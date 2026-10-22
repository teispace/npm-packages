import type { TeiPreset } from '../core/preset.js';
import { StarterKit } from '../extensions/starter-kit/index.js';

/** Writing basics with a toolbar and links, nothing floating: comment boxes, forms. */
export const minimal = {
  name: 'minimal',
  extensions: [StarterKit],
  ui: {
    bubbleMenu: false,
    slashMenu: false,
    blockHandle: false,
    contextMenu: false,
    codeBlockBar: false,
  },
} as const satisfies TeiPreset;
