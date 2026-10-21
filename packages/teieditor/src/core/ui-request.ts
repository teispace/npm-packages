import { type Signal, signal } from '@lexical/extension';

/**
 * A command's request to the UI that answers it (the link editor, an
 * insert popover), which may mount after the command runs: UIs count
 * themselves in, a UI on its way is held a place for, and one that mounts
 * takes any request newer than the last one taken. One UI takes each.
 */
export interface UiRequest {
  /** Bumped by each request. */
  readonly requests: Signal<number>;
  /** How many UIs are mounted, or held a place for. */
  readonly uis: Signal<number>;
  /** The last request a UI took. */
  taken: number;
}

export function uiRequest(): UiRequest {
  return { requests: signal(0), uis: signal(0), taken: 0 };
}

/** Whether a UI is there, or on its way, to take a request. */
export const hasUi = (request: UiRequest): boolean => request.uis.peek() > 0;

/** Ask the UI; `false` when there is none to ask. */
export function requestUi(request: UiRequest): boolean {
  if (!hasUi(request)) return false;
  request.requests.value++;
  return true;
}

/** Count a UI in, until the function returned is called. */
export function holdUi(request: UiRequest): () => void {
  request.uis.value++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    request.uis.value--;
  };
}

/** Run `take` for each request, at once for one made before this UI was there. */
export function takeRequests(request: UiRequest, take: () => void): () => void {
  return request.requests.subscribe((count) => {
    if (count <= request.taken) return;
    request.taken = count;
    take();
  });
}
