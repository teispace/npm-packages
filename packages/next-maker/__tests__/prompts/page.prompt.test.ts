import { describe, expect, it, vi } from 'vitest';

// Mock enquirer before importing the prompt — we want to inspect what
// questions actually get sent to it.
const promptMock = vi.fn();
vi.mock('enquirer', () => ({
  default: { prompt: promptMock },
}));

const { promptForPageDetails } = await import('../../src/prompts/page.prompt');

const askedNames = (): string[] => {
  const calls = promptMock.mock.calls;
  if (calls.length === 0) return [];
  const last = calls[calls.length - 1][0];
  const arr = Array.isArray(last) ? last : [last];
  return arr.map((q: any) => q.name);
};

describe('promptForPageDetails', () => {
  it('asks for name + both flags when nothing is preset', async () => {
    promptMock.mockResolvedValueOnce({
      pageName: 'dashboard',
      withLoading: true,
      withError: true,
    });

    const result = await promptForPageDetails(undefined, {});
    expect(askedNames()).toEqual(['pageName', 'withLoading', 'withError']);
    expect(result).toEqual({ pageName: 'dashboard', withLoading: true, withError: true });
  });

  it('skips the name question when name is provided', async () => {
    promptMock.mockResolvedValueOnce({ withLoading: true, withError: true });

    await promptForPageDetails('dashboard', {});
    expect(askedNames()).toEqual(['withLoading', 'withError']);
  });

  it('skips withLoading when --loading is preset', async () => {
    promptMock.mockResolvedValueOnce({ withError: false });

    const result = await promptForPageDetails('dashboard', { loading: true });
    expect(askedNames()).toEqual(['withError']);
    expect(result.withLoading).toBe(true);
    expect(result.withError).toBe(false);
  });

  it('skips withError when --error is preset', async () => {
    promptMock.mockResolvedValueOnce({ withLoading: false });

    const result = await promptForPageDetails('dashboard', { error: true });
    expect(askedNames()).toEqual(['withLoading']);
    expect(result.withError).toBe(true);
    expect(result.withLoading).toBe(false);
  });

  it('asks no questions when name + both flags are preset', async () => {
    promptMock.mockClear();

    const result = await promptForPageDetails('dashboard', { loading: true, error: true });
    expect(promptMock).not.toHaveBeenCalled();
    expect(result).toEqual({ pageName: 'dashboard', withLoading: true, withError: true });
  });

  it('preset wins over the prompt answer', async () => {
    promptMock.mockResolvedValueOnce({ withLoading: false, withError: false });

    // even if the underlying prompt somehow returned a different value, the
    // preset always takes precedence.
    const result = await promptForPageDetails('x', { loading: true, error: true });
    expect(result.withLoading).toBe(true);
    expect(result.withError).toBe(true);
  });
});
