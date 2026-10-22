/**
 * Terse Lexical JSON: the fields every node carries at their default value
 * left out, and put back on the way in. A typical document shrinks by
 * half. Which defaults apply is told by a node's shape: text has `text`,
 * an element has `children`, anything else is a leaf.
 */

type Json = Record<string, unknown>;

/** Defaults by kind of node. */
const TEXT: Json = { detail: 0, format: 0, mode: 'normal', style: '' };
const ELEMENT: Json = { direction: null, format: '', indent: 0, textFormat: 0, textStyle: '' };
const LEAF: Json = { format: '' };
const ALL: Json = { version: 1 };

const kindOf = (node: Json): Json =>
  typeof node.text === 'string' ? TEXT : Array.isArray(node.children) ? ELEMENT : LEAF;

/** Children, and the node trees in a node's slots (an image's caption), mapped. */
function nested(key: string, value: unknown, map: (node: Json) => Json): unknown {
  if (key === 'children' && Array.isArray(value)) return value.map((c) => map(c as Json));
  if (key === '$slots' && value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, slot]) => [name, map(slot as Json)]),
    );
  return undefined;
}

/** A copy of a serialized node with its default fields left out, all the way down. */
export function terseNode(node: Json): Json {
  const defaults = kindOf(node);
  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
    const inner = nested(key, value, terseNode);
    if (inner !== undefined) out[key] = inner;
    else if (!(key in defaults && defaults[key] === value) && !(key in ALL && ALL[key] === value))
      out[key] = value;
  }
  return out;
}

/** A copy of a terse node with its default fields back, all the way down. Full JSON passes unchanged. */
export function fullNode(node: Json): Json {
  const out: Json = { ...ALL, ...kindOf(node), ...node };
  for (const key of ['children', '$slots']) {
    const inner = nested(key, node[key], fullNode);
    if (inner !== undefined) out[key] = inner;
  }
  return out;
}
