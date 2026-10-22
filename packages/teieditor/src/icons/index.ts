/**
 * @teispace/teieditor/icons — the editor's icons as plain data
 * ({@link TeiIconNode}): 24×24, stroked with `currentColor`. Each is its own
 * export, so a bundle carries only the ones the installed extensions use.
 *
 * Shapes follow Lucide (https://lucide.dev, ISC licence).
 */
import type { TeiIconNode } from '../core/types.js';

// Marked free of side effects, so a bundler drops every icon nobody imports.
/** Paths from `d` strings. */
const p = /* @__NO_SIDE_EFFECTS__ */ (...d: string[]): TeiIconNode =>
  d.map((path) => ['path', { d: path }] as const);
const circle = /* @__NO_SIDE_EFFECTS__ */ (cx: number, cy: number, r: number) =>
  ['circle', { cx: String(cx), cy: String(cy), r: String(r) }] as const;
const rect = /* @__NO_SIDE_EFFECTS__ */ (
  x: number,
  y: number,
  width: number,
  height: number,
  rx = 2,
) =>
  [
    'rect',
    { x: String(x), y: String(y), width: String(width), height: String(height), rx: String(rx) },
  ] as const;

const H = 'M4 12h8M4 18V6M12 18V6';

// Text
export const bold = /* @__PURE__ */ p(
  'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8',
);
export const italic = /* @__PURE__ */ p('M19 4h-9M14 20H5M15 4 9 20');
export const underline = /* @__PURE__ */ p('M6 4v6a6 6 0 0 0 12 0V4M4 20h16');
export const strikethrough = /* @__PURE__ */ p(
  'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16',
);
export const code = /* @__PURE__ */ p('m16 18 6-6-6-6M8 6l-6 6 6 6');
export const highlight = /* @__PURE__ */ p(
  'm9 11-6 6v3h9l3-3',
  'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
);
export const subscript = /* @__PURE__ */ p(
  'm4 5 8 8M12 5l-8 8',
  'M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07',
);
export const superscript = /* @__PURE__ */ p(
  'm4 19 8-8M12 19l-8-8',
  'M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07',
);
export const uppercase = /* @__PURE__ */ p(
  'm3 15 4-8 4 8M4 13h6',
  'M15 11h4.5a2 2 0 0 1 0 4H15V7h4a2 2 0 0 1 0 4',
);
export const lowercase: TeiIconNode = [
  circle(7, 12, 3),
  ['path', { d: 'M10 9v6' }],
  circle(17, 12, 3),
  ['path', { d: 'M14 7v8' }],
];
export const capitalize: TeiIconNode = [
  ['path', { d: 'm3 15 4-8 4 8M4 13h6' }],
  circle(18, 12, 3),
  ['path', { d: 'M21 9v6' }],
];
export const clearFormatting = /* @__PURE__ */ p(
  'M4 7V4h16v3M5 20h6M13 4 8 20',
  'm15 15 5 5M20 15l-5 5',
);
export const textColor = /* @__PURE__ */ p('M4 20h16', 'm6 16 6-12 6 12M8 12h8');
export const backgroundColor = /* @__PURE__ */ p(
  'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z',
  'm5 2 5 5M2 13h15',
  'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z',
);
export const fontFamily = /* @__PURE__ */ p(
  'M12 4v16M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M9 20h6',
);
export const fontSize = /* @__PURE__ */ p(
  'M21 14h-5M16 16v-3.5a2.5 2.5 0 0 1 5 0V16',
  'M4.5 13h6M3 16l4.5-9 4.5 9',
);
/** Ruby: a small reading over a letter. */
export const ruby = /* @__PURE__ */ p('M8 3h8', 'M4 21l8-13 8 13M7.5 16h9');
export const link = /* @__PURE__ */ p(
  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
  'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
);
export const unlink = /* @__PURE__ */ p(
  'm18.84 12.25 1.72-1.71h-.02a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71',
  'm5.17 11.75-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71',
  'M8 2v3M2 8h3M16 22v-3M22 16h-3',
);
export const externalLink = /* @__PURE__ */ p(
  'M15 3h6v6M10 14 21 3',
  'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
);
export const pencil = /* @__PURE__ */ p(
  'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
  'm15 5 4 4',
);

// Blocks
export const paragraph = /* @__PURE__ */ p('M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13');
export const heading1 = /* @__PURE__ */ p(H, 'm17 12 3-2v8');
export const heading2 = /* @__PURE__ */ p(H, 'M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1');
export const heading3 = /* @__PURE__ */ p(
  H,
  'M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2',
  'M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2',
);
export const heading4 = /* @__PURE__ */ p(H, 'M17 10v3a1 1 0 0 0 1 1h3M21 10v8');
export const heading5 = /* @__PURE__ */ p(
  H,
  'M17 13v-3h4',
  'M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17',
);
export const heading6: TeiIconNode = [
  ['path', { d: H }],
  circle(19, 16, 2),
  ['path', { d: 'M20 10c-2 2-3 3.5-3 6' }],
];
export const quote = /* @__PURE__ */ p('M17 6H3M21 12H8M21 18H8M3 12v6');
export const pullQuote = /* @__PURE__ */ p(
  'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
  'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
);
export const codeBlock: TeiIconNode = [
  ['path', { d: 'm10 9-3 3 3 3M14 15l3-3-3-3' }],
  rect(3, 3, 18, 18),
];
export const bulletList = /* @__PURE__ */ p('M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13');
export const orderedList = /* @__PURE__ */ p(
  'M10 12h11M10 18h11M10 6h11',
  'M4 10h2M4 6h1v4',
  'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
);
export const checkList = /* @__PURE__ */ p('m3 17 2 2 4-4M3 7l2 2 4-4', 'M13 6h8M13 12h8M13 18h8');
export const horizontalRule = /* @__PURE__ */ p('M3 12h18', 'm8 8 4-4 4 4M16 16l-4 4-4-4');
export const pageBreak = /* @__PURE__ */ p(
  'M5 3v5h14V3M5 21v-5h14v5',
  'M3 12h2M9 12h2M13 12h2M19 12h2',
);
export const columns: TeiIconNode = [rect(3, 3, 18, 18), ['path', { d: 'M12 3v18' }]];
export const columns3: TeiIconNode = [rect(3, 3, 18, 18), ['path', { d: 'M9 3v18M15 3v18' }]];
export const columns4: TeiIconNode = [
  rect(3, 3, 18, 18),
  ['path', { d: 'M7.5 3v18M12 3v18M16.5 3v18' }],
];
export const columnsNarrowWide: TeiIconNode = [rect(3, 3, 18, 18), ['path', { d: 'M9 3v18' }]];
export const columnsWideNarrow: TeiIconNode = [rect(3, 3, 18, 18), ['path', { d: 'M15 3v18' }]];
export const columnsWideMiddle: TeiIconNode = [
  rect(3, 3, 18, 18),
  ['path', { d: 'M7 3v18M17 3v18' }],
];
export const rows3: TeiIconNode = [rect(3, 3, 18, 18), ['path', { d: 'M3 9h18M3 15h18' }]];
export const collapsible = /* @__PURE__ */ p(
  'm3 10 2.5-2.5L3 5M3 19l2.5-2.5L3 14',
  'M10 6h11M10 12h11M10 18h11',
);
export const callout: TeiIconNode = [circle(12, 12, 10), ['path', { d: 'M12 16v-4M12 8h.01' }]];
export const lightbulb = /* @__PURE__ */ p(
  'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
  'M9 18h6M10 22h4',
);
export const messageWarning = /* @__PURE__ */ p(
  'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'M12 7v2M12 13h.01',
);
export const triangleAlert = /* @__PURE__ */ p(
  'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
  'M12 9v4M12 17h.01',
);
export const octagonAlert = /* @__PURE__ */ p(
  'M12 16h.01M12 8v4',
  'M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z',
);
export const card: TeiIconNode = [rect(2, 5, 20, 14), ['path', { d: 'M2 10h20' }]];
export const stickyNote = /* @__PURE__ */ p(
  'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z',
  'M15 3v4a2 2 0 0 0 2 2h4',
);
export const poll = /* @__PURE__ */ p('M3 3v16a2 2 0 0 0 2 2h16', 'M7 16h8M7 11h12M7 6h3');
export const equation = /* @__PURE__ */ p(
  'M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2',
);
export const calendar: TeiIconNode = [
  ['path', { d: 'M8 2v4M16 2v4' }],
  rect(3, 4, 18, 18),
  ['path', { d: 'M3 10h18' }],
];
export const toc = /* @__PURE__ */ p(
  'M21 12h-8M21 6H8M21 18h-8',
  'M3 6v4c0 1.1.9 2 2 2h3M3 10v6c0 1.1.9 2 2 2h3',
);

// Media
export const image: TeiIconNode = [
  rect(3, 3, 18, 18),
  circle(9, 9, 2),
  ['path', { d: 'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21' }],
];
export const video: TeiIconNode = [rect(2, 4, 20, 16, 3), ['path', { d: 'm10 9 5 3-5 3z' }]];
export const file = /* @__PURE__ */ p(
  'm16 6-8.41 8.59a2 2 0 0 0 2.83 2.83l8.41-8.59a4 4 0 1 0-5.66-5.66l-8.38 8.55a6 6 0 1 0 8.49 8.49l8.38-8.55',
);
export const embed: TeiIconNode = [
  circle(12, 12, 10),
  ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20' }],
];
export const draw = /* @__PURE__ */ p(
  'M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z',
  'm15 5 4 4',
);
export const upload = /* @__PURE__ */ p(
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  'm17 8-5-5-5 5M12 3v12',
);
export const download = /* @__PURE__ */ p(
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  'm7 10 5 5 5-5M12 15V3',
);
export const imageStart: TeiIconNode = [
  rect(3, 4, 9, 9, 1.5),
  ['path', { d: 'M15 6h6M15 10h6M3 17h18M3 21h12' }],
];
export const imageCenter: TeiIconNode = [
  rect(7, 3, 10, 10, 1.5),
  ['path', { d: 'M3 17h18M6 21h12' }],
];
export const imageEnd: TeiIconNode = [
  rect(12, 4, 9, 9, 1.5),
  ['path', { d: 'M3 6h6M3 10h6M3 17h18M9 21h12' }],
];
export const imageFull: TeiIconNode = [rect(3, 3, 18, 12, 1.5), ['path', { d: 'M3 19h18' }]];
/** An image in a line of text. */
export const imageInline: TeiIconNode = [
  rect(9, 9, 6, 6, 1),
  ['path', { d: 'M3 5h18M3 19h18M3 12h3M18 12h3' }],
];
export const caption: TeiIconNode = [
  rect(3, 5, 18, 14),
  ['path', { d: 'M7 15h4M15 15h2M7 11h2M13 11h4' }],
];
export const altText = /* @__PURE__ */ p(
  'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2',
  'M7 8h8M7 12h10M7 16h6',
);
export const replace = /* @__PURE__ */ p(
  'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5',
  'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5',
);

// Tables
export const table: TeiIconNode = [
  ['path', { d: 'M12 3v18' }],
  rect(3, 3, 18, 18),
  ['path', { d: 'M3 9h18M3 15h18' }],
];
export const mergeCells: TeiIconNode = [
  ['path', { d: 'M12 21v-6M12 9V3M3 15h18M3 9h18' }],
  rect(3, 3, 18, 18),
];
export const splitCells: TeiIconNode = [
  ['path', { d: 'M12 15V9M3 15h18M3 9h18' }],
  rect(3, 3, 18, 18),
];
const band = (x: number, y: number, width: number, height: number) =>
  [
    'rect',
    {
      x: String(x),
      y: String(y),
      width: String(width),
      height: String(height),
      fill: 'currentColor',
      'fill-opacity': '0.25',
      stroke: 'none',
    },
  ] as const;
export const rowAbove: TeiIconNode = [rect(3, 10, 18, 11), ['path', { d: 'M12 2v6M9 5h6' }]];
export const rowBelow: TeiIconNode = [rect(3, 3, 18, 11), ['path', { d: 'M12 16v6M9 19h6' }]];
export const columnLeft: TeiIconNode = [rect(10, 3, 11, 18), ['path', { d: 'M2 12h6M5 9v6' }]];
export const columnRight: TeiIconNode = [rect(3, 3, 11, 18), ['path', { d: 'M16 12h6M19 9v6' }]];
export const deleteRow: TeiIconNode = [
  rect(3, 7, 18, 10),
  ['path', { d: 'm10 10 4 4M14 10l-4 4' }],
];
export const deleteColumn: TeiIconNode = [
  rect(7, 3, 10, 18),
  ['path', { d: 'm10 10 4 4M14 10l-4 4' }],
];
export const headerRow: TeiIconNode = [
  band(3, 3, 18, 6),
  rect(3, 3, 18, 18),
  ['path', { d: 'M3 9h18M3 15h18M12 9v12' }],
];
export const headerColumn: TeiIconNode = [
  band(3, 3, 6, 18),
  rect(3, 3, 18, 18),
  ['path', { d: 'M9 3v18M15 3v18M9 12h12' }],
];
export const stripes: TeiIconNode = [
  band(3, 9, 18, 6),
  rect(3, 3, 18, 18),
  ['path', { d: 'M3 9h18M3 15h18' }],
];
export const freeze = /* @__PURE__ */ p(
  'M2 12h20M12 2v20',
  'm20 16-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4',
);
export const paintBucket = /* @__PURE__ */ p(
  'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z',
  'm5 2 5 5M2 13h15',
  'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z',
);
export const alignTop: TeiIconNode = [['path', { d: 'M4 3h16' }], rect(7, 7, 10, 12)];
export const alignMiddle: TeiIconNode = [['path', { d: 'M3 12h4M17 12h4' }], rect(7, 6, 10, 12)];
export const alignBottom: TeiIconNode = [['path', { d: 'M4 21h16' }], rect(7, 5, 10, 12)];

// Alignment and indentation
export const alignLeft = /* @__PURE__ */ p('M15 12H3M17 18H3M21 6H3');
export const alignCenter = /* @__PURE__ */ p('M17 12H7M19 18H5M21 6H3');
export const alignRight = /* @__PURE__ */ p('M21 12H9M21 18H7M21 6H3');
export const alignJustify = /* @__PURE__ */ p('M3 12h18M3 18h18M3 6h18');
export const indent = /* @__PURE__ */ p('M21 12H11M21 18H11M21 6H11', 'm3 8 4 4-4 4');
export const outdent = /* @__PURE__ */ p('M21 12H11M21 18H11M21 6H11', 'm7 8-4 4 4 4');

// Input helpers
export const emoji: TeiIconNode = [
  circle(12, 12, 10),
  ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01' }],
];
export const mention: TeiIconNode = [
  circle(12, 12, 4),
  ['path', { d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8' }],
];
export const hashtag = /* @__PURE__ */ p('M4 9h16M4 15h16M10 3 8 21M16 3l-2 18');
// Emoji categories
export const leaf = /* @__PURE__ */ p(
  'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z',
  'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
);
export const utensils = /* @__PURE__ */ p(
  'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20',
  'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
);
export const trophy = /* @__PURE__ */ p(
  'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16',
  'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
  'M18 2H6v7a6 6 0 0 0 12 0V2Z',
);
export const plane = /* @__PURE__ */ p(
  'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
);
export const heart = /* @__PURE__ */ p(
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
);
export const flag = /* @__PURE__ */ p(
  'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
);
export const microphone: TeiIconNode = [
  ['path', { d: 'M12 19v3M19 10v2a7 7 0 0 1-14 0v-2' }],
  rect(9, 2, 6, 13, 3),
];
export const sparkles = /* @__PURE__ */ p(
  'M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z',
);
export const comment = /* @__PURE__ */ p(
  'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
);
export const search: TeiIconNode = [circle(11, 11, 8), ['path', { d: 'm21 21-4.3-4.3' }]];
// Find options: match case, whole word, regular expression.
export const caseSensitive = /* @__PURE__ */ p(
  'm3 15 4-8 4 8M4 13h6',
  'M15 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M21 9v6',
);
export const wholeWord = /* @__PURE__ */ p(
  'M4 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M10 9v6',
  'M14 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M14 7v8',
  'M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1',
);
export const regex = /* @__PURE__ */ p(
  'M17 3v10M12.67 5.5l8.66 5M12.67 10.5l8.66-5',
  'M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z',
);
export const clock: TeiIconNode = [circle(12, 12, 10), ['path', { d: 'M12 6v6l4 2' }]];
// Developer tools: the node tree, and playing its history back.
export const listTree = /* @__PURE__ */ p(
  'M21 12h-8M21 6H8M21 18h-8',
  'M3 6v4c0 1.1.9 2 2 2h3M3 10v6c0 1.1.9 2 2 2h3',
);
export const play = /* @__PURE__ */ p('M6 3v18l14-9z');
export const pause: TeiIconNode = [rect(14, 4, 4, 16, 1), rect(6, 4, 4, 16, 1)];

// Actions and chrome
export const undo = /* @__PURE__ */ p('M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11');
export const redo = /* @__PURE__ */ p('m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13');
export const plus = /* @__PURE__ */ p('M5 12h14M12 5v14');
export const minus = /* @__PURE__ */ p('M5 12h14');
export const close = /* @__PURE__ */ p('M18 6 6 18M6 6l12 12');
export const check = /* @__PURE__ */ p('M20 6 9 17l-5-5');
export const chevronDown = /* @__PURE__ */ p('m6 9 6 6 6-6');
export const chevronUp = /* @__PURE__ */ p('m18 15-6-6-6 6');
export const chevronLeft = /* @__PURE__ */ p('m15 18-6-6 6-6');
export const chevronRight = /* @__PURE__ */ p('m9 18 6-6-6-6');
export const arrowUp = /* @__PURE__ */ p('m5 12 7-7 7 7M12 19V5');
export const arrowDown = /* @__PURE__ */ p('M12 5v14m7-7-7 7-7-7');
export const arrowLeft = /* @__PURE__ */ p('m12 19-7-7 7-7M19 12H5');
export const arrowRight = /* @__PURE__ */ p('M5 12h14m-7-7 7 7-7 7');
export const grip: TeiIconNode = [
  circle(9, 12, 1),
  circle(9, 5, 1),
  circle(9, 19, 1),
  circle(15, 12, 1),
  circle(15, 5, 1),
  circle(15, 19, 1),
];
export const more: TeiIconNode = [circle(12, 12, 1), circle(19, 12, 1), circle(5, 12, 1)];
export const trash = /* @__PURE__ */ p(
  'M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
  'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6',
);
export const copy: TeiIconNode = [
  rect(8, 8, 14, 14),
  ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
];
export const cut: TeiIconNode = [
  circle(6, 6, 3),
  circle(6, 18, 3),
  ['path', { d: 'M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12' }],
];
export const paste: TeiIconNode = [
  rect(8, 2, 8, 4, 1),
  ['path', { d: 'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2' }],
  ['path', { d: 'M11 14h10m-4-4 4 4-4 4' }],
];
export const pastePlain: TeiIconNode = [
  rect(8, 2, 8, 4, 1),
  ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
  ['path', { d: 'M9 12v-1h6v1M11 17h2M12 11v6' }],
];
export const lock: TeiIconNode = [rect(3, 11, 18, 11), ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]];
export const pilcrow = paragraph;
export const spinner = /* @__PURE__ */ p('M21 12a9 9 0 1 1-6.22-8.56');

// Document
const SHEET = 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4';
export const fileText = /* @__PURE__ */ p(SHEET, 'M10 9H8M16 13H8M16 17H8');
export const fileCode = /* @__PURE__ */ p(SHEET, 'M10 12.5 8 15l2 2.5M14 12.5l2 2.5-2 2.5');
export const pages = /* @__PURE__ */ p(
  'M20 7h-3a2 2 0 0 1-2-2V2',
  'M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z',
  'M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8',
);
export const eraser = /* @__PURE__ */ p(
  'm7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21',
  'M22 21H7M5 11l9 9',
);
