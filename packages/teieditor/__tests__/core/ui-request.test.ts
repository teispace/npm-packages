import { describe, expect, it } from 'vitest';
import { hasUi, holdUi, requestUi, takeRequests, uiRequest } from '../../src/index.js';

describe('uiRequest', () => {
  it('refuses with no UI; a held place makes a request stand until a UI takes it', () => {
    const request = uiRequest();
    expect(requestUi(request)).toBe(false);
    const release = holdUi(request);
    expect(hasUi(request)).toBe(true);
    expect(requestUi(request)).toBe(true);
    release();
    release();
    expect(request.uis.peek()).toBe(0);
    const taken: string[] = [];
    // The UI that loads takes the request made before it was there.
    const stop = takeRequests(request, () => taken.push('first'));
    expect(taken).toEqual(['first']);
    // One UI takes each request; a second, mounting later, takes nothing old.
    const stopSecond = takeRequests(request, () => taken.push('second'));
    expect(taken).toEqual(['first']);
    stop();
    holdUi(request);
    requestUi(request);
    expect(taken).toEqual(['first', 'second']);
    stopSecond();
  });
});
