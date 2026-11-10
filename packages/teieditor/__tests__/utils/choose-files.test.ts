import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseFiles } from '../../src/utils/files.js';

/** Open the chooser and hand back the input it made, with clicks stubbed. */
function open(options?: Parameters<typeof chooseFiles>[1]) {
  let input: HTMLInputElement | undefined;
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement,
  ) {
    input = this;
  });
  const result = chooseFiles(document, options);
  if (!input) throw new Error('no chooser opened');
  return { result, input };
}

function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('chooseFiles', () => {
  it('resolves with the picked files, as accept and multiple asked', async () => {
    const { result, input } = open({ accept: '.txt', multiple: true });
    expect(input.accept).toBe('.txt');
    expect(input.multiple).toBe(true);
    const file = new File(['x'], 'a.txt');
    pick(input, [file]);
    input.dispatchEvent(new Event('change'));
    expect(await result).toEqual([file]);
  });

  it('keeps a file whose change comes after a cancel (Firefox)', async () => {
    vi.useFakeTimers();
    const { result, input } = open();
    input.dispatchEvent(new Event('cancel'));
    const file = new File(['x'], 'a.txt');
    pick(input, [file]);
    input.dispatchEvent(new Event('change'));
    await vi.runAllTimersAsync();
    expect(await result).toEqual([file]);
  });

  it('resolves with nothing for a cancel alone', async () => {
    vi.useFakeTimers();
    const { result, input } = open();
    input.dispatchEvent(new Event('cancel'));
    await vi.runAllTimersAsync();
    expect(await result).toEqual([]);
  });
});
