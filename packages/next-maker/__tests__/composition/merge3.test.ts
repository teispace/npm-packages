import { describe, expect, it } from 'vitest';
import { mergeText } from '../../src/composition/merge';
import { diffHunks, merge3, resolveBlock, tokenize } from '../../src/composition/merge3';

const ROOT_REDUCER = (args: string) => `import { combineSlices } from '@reduxjs/toolkit';

import { counterSlice } from '@/features/counter/store/counter.slice';

import { persistSlice } from './persistence';
IMPORTS
export const rootReducer = combineSlices(${args});

export type RootState = ReturnType<typeof rootReducer>;
`;

const WS_IMPORT = "import { wsSlice } from './slices/ws.slice';\n";
const INVOICE_IMPORT = "import { invoiceSlice } from '@/features/invoice/store';\n";

describe('diffHunks', () => {
  it('produces replacement hunks over base ranges', () => {
    expect(diffHunks(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])).toEqual([
      { start: 1, end: 2, insert: ['x'] },
      { start: 3, end: 3, insert: ['d'] },
    ]);
    expect(diffHunks(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('attaches an insertion after the repeated run it extends', () => {
    const base = tokenize('f(a, b, c)');
    const ours = tokenize('f(a, b, x, c)');
    expect(diffHunks(base, ours)).toEqual([{ start: 6, end: 6, insert: ['x', ', '] }]);
  });
});

describe('merge3', () => {
  it('applies touching edits from both sides', () => {
    expect(merge3(['a', 'b', 'c'], ['a', 'b', 'x', 'c'], ['a', 'c'])).toEqual(['a', 'x', 'c']);
    expect(merge3(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'x', 'c'])).toEqual(['a', 'x', 'c']);
  });

  it('slides an insertion out of the other side’s range when tokens line up', () => {
    const base = tokenize('f(a, b, c)');
    const ours = tokenize('f(a, b, x, c)');
    const theirs = tokenize('f(a, c)');
    expect(merge3(base, ours, theirs)?.join('')).toBe('f(a, x, c)');
  });

  it('takes an identical change once', () => {
    expect(merge3(['a', 'b'], ['a', 'x', 'b'], ['a', 'x', 'b'])).toEqual(['a', 'x', 'b']);
  });

  it('keeps both insertions made at one point, project first', () => {
    expect(merge3(['a'], ['a', 'x'], ['a', 'y'])).toEqual(['a', 'x', 'y']);
  });

  it('refuses when both sides rewrite the same token', () => {
    expect(merge3(tokenize('f(a)'), tokenize('f(b)'), tokenize('f(c)'))).toBeNull();
    expect(merge3(['a', 'b'], ['a', 'x'], ['a', 'y'])).toBeNull();
  });
});

describe('resolveBlock', () => {
  it('resolves by line before falling back to tokens', () => {
    expect(resolveBlock('x\nb\n', 'b\n', '')).toBe('x\n');
    expect(resolveBlock('f(a, b, x, c)\n', 'f(a, b, c)\n', 'f(a, c)\n')).toBe('f(a, x, c)\n');
    expect(resolveBlock('f(b)\n', 'f(a)\n', 'f(c)\n')).toBeNull();
  });
});

describe('mergeText with the resolver', () => {
  it('turns a feature off on a reducer line a generator extended', async () => {
    const base = ROOT_REDUCER('counterSlice, wsSlice, persistSlice').replace(
      'IMPORTS\n',
      WS_IMPORT,
    );
    const theirs = ROOT_REDUCER('counterSlice, persistSlice').replace('IMPORTS\n', '');
    const ours = ROOT_REDUCER('counterSlice, wsSlice, invoiceSlice, persistSlice').replace(
      'IMPORTS\n',
      `\n${INVOICE_IMPORT}\n${WS_IMPORT}\n`,
    );
    const merged = await mergeText(ours, base, theirs);
    expect(merged.conflicts).toBe(0);
    expect(merged.content).toContain('combineSlices(counterSlice, invoiceSlice, persistSlice)');
    expect(merged.content).toContain(INVOICE_IMPORT);
    expect(merged.content).not.toContain('wsSlice');
    expect(merged.content).not.toContain('<<<<<<<');
  });

  it('turns a feature on next to a generator’s registration', async () => {
    const base = ROOT_REDUCER('counterSlice, persistSlice').replace('IMPORTS\n', '');
    const theirs = ROOT_REDUCER('counterSlice, wsSlice, persistSlice').replace(
      'IMPORTS\n',
      WS_IMPORT,
    );
    const ours = ROOT_REDUCER('counterSlice, invoiceSlice, persistSlice').replace(
      'IMPORTS\n',
      INVOICE_IMPORT,
    );
    const merged = await mergeText(ours, base, theirs);
    expect(merged.conflicts).toBe(0);
    expect(merged.content).toContain(
      'combineSlices(counterSlice, invoiceSlice, wsSlice, persistSlice)',
    );
    expect(merged.content).toContain(WS_IMPORT);
    expect(merged.content).toContain(INVOICE_IMPORT);
  });

  it('keeps plain two-side markers for contested edits', async () => {
    const merged = await mergeText('a\nB\nc\n', 'a\nb\nc\n', 'a\nX\nc\n');
    expect(merged.conflicts).toBe(1);
    expect(merged.content).toBe('a\n<<<<<<< project\nB\n=======\nX\n>>>>>>> starter (new)\nc\n');
    expect(merged.content).not.toContain('|||||||');
  });

  it('resolves adjacent-line edits git alone refuses', async () => {
    const merged = await mergeText('a\nb\nnew\nc\n', 'a\nb\nc\n', 'a\nc\n');
    expect(merged).toEqual({ content: 'a\nnew\nc\n', conflicts: 0 });
  });
});
