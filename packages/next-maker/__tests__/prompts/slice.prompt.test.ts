import { describe, expect, it, vi } from 'vitest';

const promptMock = vi.fn();
vi.mock('enquirer', () => ({
  default: { prompt: promptMock },
}));

const { promptForSliceDetails } = await import('../../src/prompts/slice.prompt');

const askedNames = (): string[] => {
  const calls = promptMock.mock.calls;
  if (calls.length === 0) return [];
  const last = calls[calls.length - 1][0];
  const arr = Array.isArray(last) ? last : [last];
  return arr.map((q: { name: string }) => q.name);
};

/**
 * Regression coverage for the `--persist` / `--no-persist` tri-state. Commander
 * collapses the pair into a single `persist` option (true / false / undefined);
 * the prompt must honor an explicit `false` (don't ask, don't persist) — the
 * old code read a never-populated `noPersist` so `--no-persist` did nothing.
 */
describe('promptForSliceDetails — persist tri-state', () => {
  it('forces persistence on without asking when persist=true', async () => {
    promptMock.mockClear();
    const result = await promptForSliceDetails('cart', true);
    expect(promptMock).not.toHaveBeenCalled();
    expect(result.persistSlice).toBe(true);
  });

  it('forces persistence OFF without asking when persist=false (--no-persist)', async () => {
    promptMock.mockClear();
    const result = await promptForSliceDetails('cart', false);
    expect(promptMock).not.toHaveBeenCalled();
    expect(result.persistSlice).toBe(false);
  });

  it('asks when persist is undefined', async () => {
    promptMock.mockClear();
    promptMock.mockResolvedValueOnce({ persistSlice: true });
    const result = await promptForSliceDetails('cart', undefined);
    expect(askedNames()).toContain('persistSlice');
    expect(result.persistSlice).toBe(true);
  });

  it('asks for the name when not provided', async () => {
    promptMock.mockClear();
    promptMock.mockResolvedValueOnce({ sliceName: 'cart', persistSlice: false });
    const result = await promptForSliceDetails(undefined, undefined);
    expect(askedNames()).toContain('sliceName');
    expect(result.sliceName).toBe('cart');
  });
});
