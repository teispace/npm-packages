import { describe, expect, it, vi } from 'vitest';

const promptMock = vi.fn();
vi.mock('enquirer', () => ({
  default: { prompt: promptMock },
}));

const { promptForFaviconSource } = await import('../../src/prompts/favicon.prompt');

describe('promptForFaviconSource', () => {
  it('skips the prompt when source is preset', async () => {
    promptMock.mockClear();
    const result = await promptForFaviconSource({ source: './logo.png' });
    expect(promptMock).not.toHaveBeenCalled();
    expect(result.source).toBe('./logo.png');
  });

  it('prompts when source is missing', async () => {
    promptMock.mockResolvedValueOnce({ source: './logo.svg' });
    const result = await promptForFaviconSource({});
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('./logo.svg');
  });
});
