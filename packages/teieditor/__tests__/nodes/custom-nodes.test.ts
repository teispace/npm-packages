import type { LexicalEditor } from 'lexical';
import { beforeEach, describe, expect, it } from 'vitest';
import { CalloutNode } from '../../src/extensions/callout/callout-node.js';
import { EmbedNode } from '../../src/extensions/embed/embed-node.js';
import { FileNode } from '../../src/extensions/file/file-node.js';
import { HorizontalRuleNode } from '../../src/extensions/horizontal-rule/plugin.js';
import { ImageNode } from '../../src/extensions/image/image-node.js';
import { MathNode } from '../../src/extensions/math/math-node.js';
import { MentionNode } from '../../src/extensions/mention/mention-node.js';
import { ToggleNode } from '../../src/extensions/toggle/toggle-node.js';
import { createTestEditor, withEditor } from '../helpers/lexical-test-env.js';

describe('Custom Nodes', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createTestEditor([
      ImageNode,
      EmbedNode,
      CalloutNode,
      ToggleNode,
      FileNode,
      MathNode,
      MentionNode,
      HorizontalRuleNode,
    ]);
  });

  describe('Node types (static)', () => {
    it('ImageNode type', () => expect(ImageNode.getType()).toBe('image'));
    it('EmbedNode type', () => expect(EmbedNode.getType()).toBe('embed'));
    it('CalloutNode type', () => expect(CalloutNode.getType()).toBe('callout'));
    it('ToggleNode type', () => expect(ToggleNode.getType()).toBe('toggle'));
    it('FileNode type', () => expect(FileNode.getType()).toBe('file'));
    it('MathNode type', () => expect(MathNode.getType()).toBe('math'));
    it('MentionNode type', () => expect(MentionNode.getType()).toBe('mention'));
    it('HorizontalRuleNode type', () =>
      expect(HorizontalRuleNode.getType()).toBe('horizontal-rule'));
  });

  describe('ImageNode', () => {
    it('exports JSON correctly', async () => {
      const json = await withEditor(editor, () => {
        const node = new ImageNode('https://example.com/img.png', 'Test', 400, 300, 'Caption');
        return node.exportJSON();
      });
      expect(json.type).toBe('image');
      expect(json.src).toBe('https://example.com/img.png');
      expect(json.width).toBe(400);
      expect(json.caption).toBe('Caption');
    });

    it('defaults width/height to inherit', async () => {
      const json = await withEditor(editor, () => new ImageNode('s.png', 'a').exportJSON());
      expect(json.width).toBe('inherit');
      expect(json.height).toBe('inherit');
    });

    it('is not inline', async () => {
      expect(await withEditor(editor, () => new ImageNode('s', 'a').isInline())).toBe(false);
    });
  });

  describe('EmbedNode', () => {
    it('auto-detects YouTube', async () => {
      const t = await withEditor(
        editor,
        () => new EmbedNode('https://youtube.com/watch?v=abc').exportJSON().embedType,
      );
      expect(t).toBe('youtube');
    });

    it('auto-detects Twitter', async () => {
      const t = await withEditor(
        editor,
        () => new EmbedNode('https://twitter.com/u/status/1').exportJSON().embedType,
      );
      expect(t).toBe('twitter');
    });

    it('falls back to generic', async () => {
      const t = await withEditor(
        editor,
        () => new EmbedNode('https://example.com').exportJSON().embedType,
      );
      expect(t).toBe('generic');
    });
  });

  describe('CalloutNode', () => {
    it('defaults to info', async () => {
      expect(await withEditor(editor, () => new CalloutNode().getVariant())).toBe('info');
    });

    it('accepts all variants', async () => {
      for (const v of ['info', 'warning', 'error', 'success', 'note'] as const) {
        expect(await withEditor(editor, () => new CalloutNode(v).getVariant())).toBe(v);
      }
    });

    it('exports JSON', async () => {
      const json = await withEditor(editor, () => new CalloutNode('warning').exportJSON());
      expect(json.type).toBe('callout');
      expect(json.variant).toBe('warning');
    });
  });

  describe('ToggleNode', () => {
    it('defaults closed with "Toggle" title', async () => {
      const r = await withEditor(editor, () => {
        const n = new ToggleNode();
        return { title: n.getTitle(), open: n.isOpen() };
      });
      expect(r.title).toBe('Toggle');
      expect(r.open).toBe(false);
    });

    it('exports JSON', async () => {
      const json = await withEditor(editor, () => new ToggleNode('FAQ', true).exportJSON());
      expect(json.title).toBe('FAQ');
      expect(json.open).toBe(true);
    });
  });

  describe('FileNode', () => {
    it('exports JSON', async () => {
      const json = await withEditor(editor, () =>
        new FileNode('url', 'doc.pdf', 1024, 'application/pdf').exportJSON(),
      );
      expect(json.type).toBe('file');
      expect(json.fileName).toBe('doc.pdf');
      expect(json.fileSize).toBe(1024);
    });
  });

  describe('MathNode', () => {
    it('defaults to block', async () => {
      expect(await withEditor(editor, () => new MathNode('E=mc^2').isInline())).toBe(false);
    });

    it('supports inline', async () => {
      expect(await withEditor(editor, () => new MathNode('x', true).isInline())).toBe(true);
    });

    it('exports JSON', async () => {
      const json = await withEditor(editor, () => new MathNode('\\sum', false).exportJSON());
      expect(json.expression).toBe('\\sum');
    });
  });

  describe('MentionNode', () => {
    it('is a text entity', async () => {
      expect(await withEditor(editor, () => new MentionNode('J', '1').isTextEntity())).toBe(true);
    });

    it('cannot insert text around it', async () => {
      const r = await withEditor(editor, () => {
        const n = new MentionNode('J', '1');
        return { before: n.canInsertTextBefore(), after: n.canInsertTextAfter() };
      });
      expect(r.before).toBe(false);
      expect(r.after).toBe(false);
    });

    it('exports JSON', async () => {
      const json = await withEditor(editor, () =>
        new MentionNode('John', 'u1', 'user').exportJSON(),
      );
      expect(json.mentionName).toBe('John');
      expect(json.mentionId).toBe('u1');
      expect(json.mentionType).toBe('user');
    });
  });

  describe('HorizontalRuleNode', () => {
    it('is not inline', async () => {
      expect(await withEditor(editor, () => new HorizontalRuleNode().isInline())).toBe(false);
    });

    it('exports JSON', async () => {
      const json = await withEditor(editor, () => new HorizontalRuleNode().exportJSON());
      expect(json.type).toBe('horizontal-rule');
    });
  });
});
