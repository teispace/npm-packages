'use client';

import { useEffect, useRef } from 'react';
import { holdUi, takeRequests, type UiRequest } from '../core/ui-request.js';

/**
 * Answer a command's requests (`openLinkEditor`, `openImageInsert`) from
 * this component: it counts as the UI while mounted, and `take` runs for
 * each request, including one made while it was loading.
 */
export function useUiRequest(request: UiRequest | undefined, take: () => void): void {
  const latest = useRef(take);
  latest.current = take;
  useEffect(() => {
    if (!request) return;
    const release = holdUi(request);
    const stop = takeRequests(request, () => latest.current());
    return () => {
      stop();
      release();
    };
  }, [request]);
}
