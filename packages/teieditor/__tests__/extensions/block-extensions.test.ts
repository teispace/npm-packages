import { describe, expect, it } from 'vitest';
import { Blockquote } from '../../src/extensions/blockquote/index.js';
import { CodeBlock } from '../../src/extensions/code-block/index.js';
import { Heading } from '../../src/extensions/heading/index.js';
import { HorizontalRule } from '../../src/extensions/horizontal-rule/index.js';
import { Link } from '../../src/extensions/link/index.js';
import { List } from '../../src/extensions/list/index.js';
import { Paragraph } from '../../src/extensions/paragraph/index.js';

describe('Block Extensions', () => {
  describe('Heading', () => {
    it('has name "heading"', () => {
      expect(Heading.name).toBe('heading');
    });

    it('registers HeadingNode', () => {
      const nodes = Heading.getNodes!();
      expect(nodes.length).toBe(1);
    });

    it('defaults to all heading levels', () => {
      expect(Heading.config.levels).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    });

    it('can restrict heading levels', () => {
      const h = Heading.configure({ levels: ['h1', 'h2'] });
      expect(h.config.levels).toEqual(['h1', 'h2']);
    });
  });

  describe('Paragraph', () => {
    it('has name "paragraph"', () => {
      expect(Paragraph.name).toBe('paragraph');
    });

    it('registers ParagraphNode', () => {
      const nodes = Paragraph.getNodes!();
      expect(nodes.length).toBe(1);
    });
  });

  describe('Blockquote', () => {
    it('has name "blockquote"', () => {
      expect(Blockquote.name).toBe('blockquote');
    });

    it('registers QuoteNode', () => {
      const nodes = Blockquote.getNodes!();
      expect(nodes.length).toBe(1);
    });
  });

  describe('HorizontalRule', () => {
    it('has name "horizontalRule"', () => {
      expect(HorizontalRule.name).toBe('horizontalRule');
    });

    it('registers HorizontalRuleNode', () => {
      const nodes = HorizontalRule.getNodes!();
      expect(nodes.length).toBe(1);
    });

    it('provides a plugin', () => {
      const plugins = HorizontalRule.getPlugins!();
      expect(plugins.length).toBe(1);
    });
  });

  describe('CodeBlock', () => {
    it('has name "codeBlock"', () => {
      expect(CodeBlock.name).toBe('codeBlock');
    });

    it('registers CodeNode and CodeHighlightNode', () => {
      const nodes = CodeBlock.getNodes!();
      expect(nodes.length).toBe(2);
    });

    it('defaults to javascript language', () => {
      expect(CodeBlock.config.defaultLanguage).toBe('javascript');
    });

    it('provides a code highlight plugin', () => {
      const plugins = CodeBlock.getPlugins!();
      expect(plugins.length).toBe(1);
    });
  });

  describe('List', () => {
    it('has name "list"', () => {
      expect(List.name).toBe('list');
    });

    it('registers ListNode and ListItemNode', () => {
      const nodes = List.getNodes!();
      expect(nodes.length).toBe(2);
    });

    it('defaults to checklist enabled', () => {
      expect(List.config.checklist).toBe(true);
    });

    it('defaults to max depth 7', () => {
      expect(List.config.maxDepth).toBe(7);
    });

    it('provides list plugins (with checklist)', () => {
      const plugins = List.getPlugins!();
      expect(plugins.length).toBe(2); // ListPlugin + CheckListPlugin
    });

    it('provides only ListPlugin when checklist disabled', () => {
      const list = List.configure({ checklist: false });
      const plugins = list.getPlugins!();
      expect(plugins.length).toBe(1);
    });

    it('has keyboard shortcuts', () => {
      const bindings = List.getKeyBindings!();
      expect(bindings).toHaveProperty('Mod+Shift+7');
      expect(bindings).toHaveProperty('Mod+Shift+8');
      expect(bindings).toHaveProperty('Mod+Shift+9');
    });
  });

  describe('Link', () => {
    it('has name "link"', () => {
      expect(Link.name).toBe('link');
    });

    it('registers LinkNode and AutoLinkNode by default', () => {
      const nodes = Link.getNodes!();
      expect(nodes.length).toBe(2);
    });

    it('registers only LinkNode when autoLink disabled', () => {
      const link = Link.configure({ autoLink: false });
      const nodes = link.getNodes!();
      expect(nodes.length).toBe(1);
    });

    it('has Ctrl+K shortcut', () => {
      const bindings = Link.getKeyBindings!();
      expect(bindings).toHaveProperty('Mod+K');
    });
  });
});
