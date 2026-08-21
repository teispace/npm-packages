import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTeiEditor } from '../../src/core/editor.js';
import { TeiEditorProvider, TeiEditorSlot } from '../../src/core/index.js';
import { Paragraph } from '../../src/extensions/paragraph/index.js';
import { WordCount } from '../../src/extensions/word-count/index.js';
import { EditorContent } from '../../src/plugins/rich-text-plugin.js';
import { TeiEditor, TeiEditorNotion } from '../../src/react/index.js';

async function tick(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

describe('extension chrome slot', () => {
  it('renders nothing when the host places no slot', async () => {
    const editor = createTeiEditor({ extensions: [Paragraph, WordCount] });
    const { container } = render(
      <TeiEditorProvider editor={editor}>
        <div className="toolbar-stand-in" />
        <EditorContent />
      </TeiEditorProvider>,
    );
    await tick();

    // Previously the WordCount status bar painted here — above the toolbar,
    // because extension plugins mount before `children`.
    expect(container.querySelector('.tei-word-count')).toBeNull();
  });

  it('portals extension chrome into the slot, wherever the host places it', async () => {
    const editor = createTeiEditor({ extensions: [Paragraph, WordCount] });
    const { container } = render(
      <TeiEditorProvider editor={editor}>
        <div className="toolbar-stand-in" />
        <EditorContent />
        <TeiEditorSlot className="my-status-bar" />
      </TeiEditorProvider>,
    );
    await tick();

    const bar = container.querySelector('.tei-word-count');
    expect(bar).not.toBeNull();
    expect(bar?.parentElement?.className).toBe('my-status-bar');

    // …and it comes after the toolbar and the content, not before.
    const toolbar = container.querySelector('.toolbar-stand-in') as HTMLElement;
    expect(
      toolbar.compareDocumentPosition(bar as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('throws when the slot is rendered outside a provider', () => {
    expect(() => render(<TeiEditorSlot />)).toThrow(/within <TeiEditorProvider>/);
  });
});

describe('drop-in word count placement', () => {
  it('renders the status bar below the content, not above the toolbar', async () => {
    const { container } = render(<TeiEditor />);
    await tick();

    const wrapper = container.querySelector('.tei-editor-wrapper') as HTMLElement;
    const bar = wrapper.querySelector('.tei-word-count');
    const content = wrapper.querySelector('.tei-editor-content') as HTMLElement;

    expect(bar).not.toBeNull();
    expect(
      content.compareDocumentPosition(bar as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The bar lives in the last child of the wrapper — nothing renders after it.
    expect(wrapper.lastElementChild?.contains(bar as Node)).toBe(true);
  });

  it('can be turned off with showWordCount={false}', async () => {
    const { container } = render(<TeiEditor showWordCount={false} />);
    await tick();
    expect(container.querySelector('.tei-word-count')).toBeNull();
  });

  it('is off by default in the chrome-free Notion preset', async () => {
    const { container } = render(<TeiEditorNotion />);
    await tick();
    expect(container.querySelector('.tei-word-count')).toBeNull();
  });

  it('can be turned on in the Notion preset', async () => {
    const { container } = render(<TeiEditorNotion showWordCount />);
    await tick();
    expect(container.querySelector('.tei-word-count')).not.toBeNull();
  });
});
