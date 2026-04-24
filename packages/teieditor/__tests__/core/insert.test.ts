import { $getRoot, $isRangeSelection } from 'lexical';
import { describe, expect, it } from 'vitest';
import { $getOrCreateRangeSelection } from '../../src/core/insert.js';
import { createTestEditor, withEditor } from '../helpers/lexical-test-env.js';

describe('$getOrCreateRangeSelection', () => {
  it('returns the existing range selection when one is present', async () => {
    const editor = createTestEditor();
    const kind = await withEditor(editor, () => {
      // A fresh editor starts without a DOM selection; calling selectEnd()
      // creates one so the assertion is meaningful.
      $getRoot().selectEnd();
      const sel = $getOrCreateRangeSelection();
      return sel && $isRangeSelection(sel) ? 'range' : 'other';
    });
    expect(kind).toBe('range');
  });

  it('falls back to placing the cursor at the root end when no selection exists', async () => {
    const editor = createTestEditor();
    const kind = await withEditor(editor, () => {
      const sel = $getOrCreateRangeSelection();
      return sel && $isRangeSelection(sel) ? 'range' : 'other';
    });
    // Without any prior focus / selection, the helper should still return a
    // usable RangeSelection anchored at the root end.
    expect(kind).toBe('range');
  });
});
