import { $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';
import { ImageNode } from '../../src/extensions/image/image-node.js';
import { $deserialize, type SerializationFormat } from '../../src/utils/serialization.js';
import { createTestEditor, withEditor } from '../helpers/lexical-test-env.js';

describe('Serialization Types', () => {
  it('SerializationFormat accepts valid formats', () => {
    const formats: SerializationFormat[] = ['html', 'markdown', 'json', 'text'];
    expect(formats).toHaveLength(4);
  });
});

// Note: Full serialize/deserialize tests require a mounted Lexical editor
// which needs a DOM environment with LexicalComposer. These are integration
// tests that would be better suited for a browser/e2e test setup.
// The unit tests here validate the types and exports.

describe('Serialization exports', () => {
  it('exports serialize function', async () => {
    const mod = await import('../../src/utils/serialization.js');
    expect(typeof mod.serialize).toBe('function');
    expect(typeof mod.deserialize).toBe('function');
    expect(typeof mod.$serialize).toBe('function');
    expect(typeof mod.$deserialize).toBe('function');
  });
});

describe('Utils barrel exports', () => {
  it('exports all utilities', async () => {
    const mod = await import('../../src/utils/index.js');
    expect(typeof mod.toggleFormat).toBe('function');
    expect(typeof mod.serialize).toBe('function');
    expect(typeof mod.deserialize).toBe('function');
    expect(typeof mod.$serialize).toBe('function');
    expect(typeof mod.$deserialize).toBe('function');
  });
});

describe('plain-text deserialize is inert (no structural injection)', () => {
  it('treats HTML tags in "text" as literal text, not nodes', async () => {
    const editor = createTestEditor([ImageNode]);

    const result = await withEditor(editor, () => {
      $deserialize('<img src=x onerror="alert(1)"> hello\nplain & <b>bold</b>', 'text', editor);
      const root = $getRoot();
      return {
        text: root.getTextContent(),
        // Crucially: no ImageNode (or any non-paragraph descendant) was created.
        hasImage: root
          .getChildren()
          .some(
            (p) =>
              'getChildren' in p &&
              (p as any).getChildren().some((n: any) => n.getType() === 'image'),
          ),
      };
    });

    // The angle-bracket markup survives verbatim as text…
    expect(result.text).toContain('<img src=x onerror="alert(1)">');
    expect(result.text).toContain('<b>bold</b>');
    // …and produced zero injected nodes.
    expect(result.hasImage).toBe(false);
  });

  it('preserves newline structure as separate paragraphs', async () => {
    const editor = createTestEditor();
    const paragraphCount = await withEditor(editor, () => {
      $deserialize('line one\nline two\nline three', 'text', editor);
      return $getRoot().getChildren().length;
    });
    expect(paragraphCount).toBe(3);
  });
});
