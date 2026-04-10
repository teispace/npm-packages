import { describe, expect, it } from 'vitest';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';

describe('StarterKit', () => {
  it('is an array of extensions', () => {
    expect(Array.isArray(StarterKit)).toBe(true);
  });

  it('contains all expected extensions', () => {
    const names = StarterKit.map((ext) => ext.name);

    // Text formatting
    expect(names).toContain('bold');
    expect(names).toContain('italic');
    expect(names).toContain('underline');
    expect(names).toContain('strikethrough');
    expect(names).toContain('code');
    expect(names).toContain('highlight');
    expect(names).toContain('subscript');
    expect(names).toContain('superscript');

    // Block-level
    expect(names).toContain('paragraph');
    expect(names).toContain('heading');
    expect(names).toContain('blockquote');
    expect(names).toContain('horizontalRule');
    expect(names).toContain('codeBlock');

    // Lists & links
    expect(names).toContain('list');
    expect(names).toContain('link');

    // Alignment & fonts
    expect(names).toContain('alignment');
    expect(names).toContain('fontSize');
    expect(names).toContain('fontFamily');
    expect(names).toContain('color');

    // Notion-like
    expect(names).toContain('slashCommand');
    expect(names).toContain('dragHandle');
    expect(names).toContain('placeholder');
    expect(names).toContain('turnInto');

    // Rich content
    expect(names).toContain('image');
    expect(names).toContain('table');
    expect(names).toContain('embed');
    expect(names).toContain('callout');
    expect(names).toContain('toggle');
    expect(names).toContain('file');

    // Advanced
    expect(names).toContain('mention');
    expect(names).toContain('emoji');
    expect(names).toContain('markdown');
    expect(names).toContain('findReplace');
    expect(names).toContain('wordCount');
    expect(names).toContain('math');

    // Utilities
    expect(names).toContain('history');
  });

  it('has no duplicate extension names', () => {
    const names = StarterKit.map((ext) => ext.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('all extensions have a name', () => {
    for (const ext of StarterKit) {
      expect(ext.name).toBeTruthy();
      expect(typeof ext.name).toBe('string');
    }
  });

  it('all extensions have a configure method', () => {
    for (const ext of StarterKit) {
      expect(typeof ext.configure).toBe('function');
    }
  });
});
