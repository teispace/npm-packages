import { describe, expect, it } from 'vitest';
import { STARTER_REF, STARTER_REPO, starterSource } from '../../src/config/starter';

describe('starterSource', () => {
  it('names the pinned starter the CLI was built against', () => {
    expect(STARTER_REPO).toBe('teispace/nextjs-starter');
    expect(starterSource()).toBe(
      STARTER_REF === 'main' ? STARTER_REPO : `${STARTER_REPO}#${STARTER_REF}`,
    );
  });
});
