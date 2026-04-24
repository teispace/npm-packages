import { $getRoot, $getSelection, $isRangeSelection, type RangeSelection } from 'lexical';

/**
 * Resolve a `RangeSelection` we can call `.insertNodes()` on, even when the
 * editor lost its selection (e.g. because a toolbar button or dialog stole
 * focus). Call this inside an `editor.update()` block.
 *
 * Behaviour:
 * - If there is already a valid RangeSelection, return it.
 * - Otherwise, place the cursor at the end of the root and return that.
 * - Returns `null` only if Lexical cannot create a selection at all, which
 *   should never happen in practice (the root is always present).
 *
 * Use from any insert command handler so the command is robust to missing
 * focus — the dispatcher doesn't have to remember to restore selection.
 */
export function $getOrCreateRangeSelection(): RangeSelection | null {
  const existing = $getSelection();
  if ($isRangeSelection(existing)) return existing;
  $getRoot().selectEnd();
  const after = $getSelection();
  return $isRangeSelection(after) ? after : null;
}
