import { describe, expect, it, vi } from 'vitest';

const promptMock = vi.fn();
vi.mock('enquirer', () => ({
  default: { prompt: promptMock },
}));

const { promptForLocaleDetails } = await import('../../src/prompts/locale.prompt');

const askedNames = (): string[] => {
  const calls = promptMock.mock.calls;
  if (calls.length === 0) return [];
  const last = calls[calls.length - 1][0];
  const arr = Array.isArray(last) ? last : [last];
  return arr.map((q: any) => q.name);
};

describe('promptForLocaleDetails', () => {
  it('asks the full set when nothing is preset', async () => {
    promptMock.mockResolvedValueOnce({
      code: 'es',
      name: 'Spanish',
      country: 'Spain',
      flag: '🇪🇸',
      copyTranslations: false,
    });

    await promptForLocaleDetails(undefined, {});
    expect(askedNames()).toEqual(['code', 'name', 'country', 'flag', 'copyTranslations']);
  });

  it('skips the code prompt when code is provided', async () => {
    promptMock.mockResolvedValueOnce({
      name: 'Spanish',
      country: 'Spain',
      flag: '🇪🇸',
      copyTranslations: false,
    });

    await promptForLocaleDetails('es', {});
    expect(askedNames()).toEqual(['name', 'country', 'flag', 'copyTranslations']);
  });

  it('skips copyTranslations when --copy-translations is preset', async () => {
    promptMock.mockResolvedValueOnce({
      name: 'Spanish',
      country: 'Spain',
      flag: '🇪🇸',
    });

    const result = await promptForLocaleDetails('es', { copyTranslations: true });
    expect(askedNames()).toEqual(['name', 'country', 'flag']);
    expect(result.copyTranslations).toBe(true);
  });

  it('preset wins over the prompt answer', async () => {
    promptMock.mockResolvedValueOnce({
      name: 'Spanish',
      country: 'Spain',
      flag: '🇪🇸',
      copyTranslations: false,
    });

    const result = await promptForLocaleDetails('es', { copyTranslations: true });
    expect(result.copyTranslations).toBe(true);
  });
});
