import { describe, expect, it, vi } from 'vitest';

const promptMock = vi.fn();
vi.mock('enquirer', () => ({
  default: { prompt: promptMock },
}));

const { promptForComponentDetails } = await import('../../src/prompts/component.prompt');

const askedNames = (): string[] => {
  const calls = promptMock.mock.calls;
  if (calls.length === 0) return [];
  const last = calls[calls.length - 1][0];
  const arr = Array.isArray(last) ? last : [last];
  return arr.map((q: any) => q.name);
};

describe('promptForComponentDetails', () => {
  it('asks for name and isClient when nothing is preset', async () => {
    promptMock.mockResolvedValueOnce({ componentName: 'data-table', isClient: true });

    const result = await promptForComponentDetails(undefined, {});
    expect(askedNames()).toEqual(['componentName', 'isClient']);
    expect(result).toEqual({ componentName: 'data-table', isClient: true });
  });

  it('skips isClient when --client is preset', async () => {
    promptMock.mockResolvedValueOnce({ componentName: 'data-table' });

    const result = await promptForComponentDetails(undefined, { client: true });
    expect(askedNames()).toEqual(['componentName']);
    expect(result.isClient).toBe(true);
  });

  it('asks no questions when name + flag are both preset', async () => {
    promptMock.mockClear();

    const result = await promptForComponentDetails('data-table', { client: false });
    expect(promptMock).not.toHaveBeenCalled();
    expect(result).toEqual({ componentName: 'data-table', isClient: false });
  });

  it('preset wins over the prompt answer', async () => {
    promptMock.mockResolvedValueOnce({ isClient: false });

    const result = await promptForComponentDetails('x', { client: true });
    expect(result.isClient).toBe(true);
  });
});
