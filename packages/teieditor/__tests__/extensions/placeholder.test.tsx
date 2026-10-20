import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { act, render } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { createTeiEditor } from '../../src/core/editor.js';
import { TeiEditorProvider } from '../../src/core/index.js';
import { Heading } from '../../src/extensions/heading/index.js';
import { Paragraph } from '../../src/extensions/paragraph/index.js';
import { Placeholder } from '../../src/extensions/placeholder/index.js';
import { EditorContent } from '../../src/plugins/rich-text-plugin.js';

const PACKAGE = join(__dirname, '..', '..');

async function tick(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

function Capture({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => onEditor(editor), [editor, onEditor]);
  return null;
}

async function mount() {
  let lexical: LexicalEditor | undefined;
  const result = render(
    <TeiEditorProvider editor={createTeiEditor({ extensions: [Paragraph, Heading, Placeholder] })}>
      <EditorContent />
      <Capture
        onEditor={(e) => {
          lexical = e;
        }}
      />
    </TeiEditorProvider>,
  );
  await tick();
  if (!lexical) throw new Error('editor did not mount');
  return { ...result, editor: lexical };
}

const update = (editor: LexicalEditor, fn: () => void) =>
  act(async () => {
    editor.update(fn, { discrete: true });
  });

describe('Placeholder', () => {
  it('injects no stylesheet, so a strict style-src needs nothing for it', async () => {
    const before = document.querySelectorAll('style').length;
    const { unmount } = await mount();
    expect(document.querySelectorAll('style').length).toBe(before);
    expect(document.getElementById('tei-placeholder-styles')).toBeNull();
    unmount();
  });

  it('marks empty blocks only, and clears the mark once there is text', async () => {
    const { container, editor } = await mount();
    await update(editor, () => {
      $getRoot().clear().append($createParagraphNode(), $createParagraphNode());
    });
    const marked = () => container.querySelectorAll('[data-tei-placeholder]').length;
    expect(marked()).toBe(2);

    await update(editor, () => {
      $getRoot()
        .getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>()
        .append($createTextNode('hi'));
    });
    expect(marked()).toBe(1);
  });

  it('leaves the DOM alone when an update does not change any block’s emptiness', async () => {
    const { container, editor } = await mount();
    await update(editor, () => {
      const p = $createParagraphNode();
      p.append($createTextNode('a'));
      $getRoot().clear().append(p, $createParagraphNode());
    });

    const writes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => writes.push(...records));
    observer.observe(container, {
      attributes: true,
      attributeFilter: ['data-tei-placeholder'],
      subtree: true,
    });
    await update(editor, () => {
      $getRoot()
        .getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>()
        .append($createTextNode('b'));
    });
    observer.disconnect();
    expect(writes).toEqual([]);
  });

  it('keeps working in a second editor after the first unmounts', async () => {
    const first = await mount();
    const second = await mount();
    first.unmount();
    await update(second.editor, () => {
      $getRoot().clear().append($createParagraphNode());
    });
    expect(second.container.querySelector('[data-tei-placeholder]')).not.toBeNull();
    second.unmount();
  });
});

describe('the stylesheet', () => {
  const styles = readFileSync(join(PACKAGE, 'styles.css'), 'utf8');

  it('shows the placeholder without :empty, which an empty block never matches', () => {
    expect(styles).toContain('[data-tei-placeholder]::before {');
    expect(styles).not.toMatch(/data-tei-placeholder\]:empty/);
  });

  it('defines the placeholder colour in light and dark, so a nested .dark resolves it', () => {
    expect(styles.match(/--tei-placeholder-color: hsl\(var\(--tei-placeholder\)\);/g)).toHaveLength(
      2,
    );
  });

  it('carries the same tokens as src/themes/variables.css, which the registry ships', () => {
    const variables = readFileSync(join(PACKAGE, 'src', 'themes', 'variables.css'), 'utf8');
    const tokens = (css: string) =>
      [...css.matchAll(/^\s*(--tei-[\w-]+)\s*:\s*([^;]+);/gm)].map(
        ([, name, value]) => `${name}: ${value}`,
      );
    expect(tokens(styles)).toEqual(tokens(variables));
  });
});
