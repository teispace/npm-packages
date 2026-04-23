import { describe, expect, it } from 'vitest';
import { createTeiEditor } from '../../src/core/editor.js';
import { Bold } from '../../src/extensions/bold/index.js';
import { FontFamily } from '../../src/extensions/font-family/index.js';
import { Heading } from '../../src/extensions/heading/index.js';
import { History } from '../../src/extensions/history/index.js';
import { Italic } from '../../src/extensions/italic/index.js';
import { Paragraph } from '../../src/extensions/paragraph/index.js';

describe('createTeiEditor', () => {
  it('creates an editor instance with default config', () => {
    const editor = createTeiEditor({ extensions: [] });

    expect(editor).toBeDefined();
    expect(editor.config).toBeDefined();
    expect(editor.extensions).toEqual([]);
    expect(editor.nodes).toEqual([]);
    expect(editor.plugins).toEqual([]);
  });

  it('uses default namespace', () => {
    const editor = createTeiEditor({ extensions: [] });
    expect(editor.composerConfig.namespace).toBe('TeiEditor');
  });

  it('allows custom namespace', () => {
    const editor = createTeiEditor({ extensions: [], namespace: 'MyEditor' });
    expect(editor.composerConfig.namespace).toBe('MyEditor');
  });

  it('defaults to editable', () => {
    const editor = createTeiEditor({ extensions: [] });
    expect(editor.composerConfig.editable).toBe(true);
  });

  it('respects editable: false', () => {
    const editor = createTeiEditor({ extensions: [], editable: false });
    expect(editor.composerConfig.editable).toBe(false);
  });

  it('collects nodes from extensions', () => {
    const editor = createTeiEditor({
      extensions: [Paragraph, Heading],
    });

    expect(editor.nodes.length).toBeGreaterThan(0);
  });

  it('collects plugins from extensions', () => {
    const editor = createTeiEditor({
      extensions: [History],
    });

    expect(editor.plugins.length).toBeGreaterThan(0);
  });

  it('preserves extension order', () => {
    const extensions = [Bold, Italic, Paragraph];
    const editor = createTeiEditor({ extensions });

    expect(editor.extensions).toEqual(extensions);
    expect(editor.extensions[0]!.name).toBe('bold');
    expect(editor.extensions[1]!.name).toBe('italic');
    expect(editor.extensions[2]!.name).toBe('paragraph');
  });

  it('provides a composerConfig ready for LexicalComposer', () => {
    const editor = createTeiEditor({ extensions: [Paragraph] });
    const config = editor.composerConfig;

    expect(config).toHaveProperty('namespace');
    expect(config).toHaveProperty('theme');
    expect(config).toHaveProperty('nodes');
    expect(config).toHaveProperty('editable');
    expect(config).toHaveProperty('onError');
    expect(typeof config.onError).toBe('function');
  });

  it('applies custom theme', () => {
    const customTheme = { paragraph: 'my-paragraph' };
    const editor = createTeiEditor({ extensions: [], theme: customTheme });

    expect(editor.composerConfig.theme).toEqual(customTheme);
  });

  it('uses default theme when none provided', () => {
    const editor = createTeiEditor({ extensions: [] });
    expect(editor.composerConfig.theme).toBeDefined();
    expect(editor.composerConfig.theme.paragraph).toBeDefined();
  });

  describe('extension dedup', () => {
    it('dedups extensions by name, keeping the last one (user override wins)', () => {
      const defaultFontFamily = FontFamily;
      const customFontFamily = FontFamily.configure({
        families: [{ label: 'Custom', value: 'Custom, serif' }],
      });

      const editor = createTeiEditor({
        extensions: [defaultFontFamily, customFontFamily],
      });

      const fontFamilyExts = editor.extensions.filter((e) => e.name === 'fontFamily');
      expect(fontFamilyExts).toHaveLength(1);
      expect(fontFamilyExts[0]).toBe(customFontFamily);
    });

    it('preserves order for non-duplicate extensions', () => {
      const editor = createTeiEditor({
        extensions: [Bold, Italic, Paragraph],
      });
      expect(editor.extensions.map((e) => e.name)).toEqual(['bold', 'italic', 'paragraph']);
    });

    it('keeps the later duplicate and still preserves relative order around it', () => {
      // [Bold, Italic, Bold.configure(...)] → [Italic, Bold.configure(...)]
      // First Bold is dropped; Italic stays before the override Bold.
      const overrideBold = { ...Bold, name: 'bold' };
      const editor = createTeiEditor({
        extensions: [Bold, Italic, overrideBold],
      });
      expect(editor.extensions.map((e) => e.name)).toEqual(['italic', 'bold']);
      expect(editor.extensions.at(-1)).toBe(overrideBold);
    });
  });
});
