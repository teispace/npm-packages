import { describe, expect, it } from 'vitest';
import { Callout } from '../../src/extensions/callout/index.js';
import { Embed } from '../../src/extensions/embed/index.js';
import { File } from '../../src/extensions/file/index.js';
import { Image } from '../../src/extensions/image/index.js';
import { Table } from '../../src/extensions/table/index.js';
import { Toggle } from '../../src/extensions/toggle/index.js';

describe('Rich Content Extensions', () => {
  describe('Image', () => {
    it('has name "image"', () => {
      expect(Image.name).toBe('image');
    });

    it('registers ImageNode', () => {
      expect(Image.getNodes!().length).toBe(1);
    });

    it('has default config', () => {
      expect(Image.config.maxSize).toBe(10 * 1024 * 1024);
      expect(Image.config.accept).toContain('image/png');
      expect(Image.config.accept).toContain('image/jpeg');
    });

    it('can configure upload handler', () => {
      const uploadFn = async () => 'https://example.com/image.png';
      const img = Image.configure({ onUpload: uploadFn });
      expect(img.config.onUpload).toBe(uploadFn);
    });

    it('can configure max size', () => {
      const img = Image.configure({ maxSize: 5 * 1024 * 1024 });
      expect(img.config.maxSize).toBe(5 * 1024 * 1024);
    });
  });

  describe('Table', () => {
    it('has name "table"', () => {
      expect(Table.name).toBe('table');
    });

    it('registers 3 nodes (Table, Row, Cell)', () => {
      expect(Table.getNodes!().length).toBe(3);
    });

    it('has default config', () => {
      expect(Table.config.defaultRows).toBe(3);
      expect(Table.config.defaultColumns).toBe(3);
    });

    it('provides plugins', () => {
      expect(Table.getPlugins!().length).toBe(2); // TablePlugin + TableActionPlugin
    });
  });

  describe('Embed', () => {
    it('has name "embed"', () => {
      expect(Embed.name).toBe('embed');
    });

    it('registers EmbedNode', () => {
      expect(Embed.getNodes!().length).toBe(1);
    });
  });

  describe('Callout', () => {
    it('has name "callout"', () => {
      expect(Callout.name).toBe('callout');
    });

    it('registers CalloutNode', () => {
      expect(Callout.getNodes!().length).toBe(1);
    });
  });

  describe('Toggle', () => {
    it('has name "toggle"', () => {
      expect(Toggle.name).toBe('toggle');
    });

    it('registers collapsible nodes', () => {
      expect(Toggle.getNodes!().length).toBe(4);
    });
  });

  describe('File', () => {
    it('has name "file"', () => {
      expect(File.name).toBe('file');
    });

    it('registers FileNode', () => {
      expect(File.getNodes!().length).toBe(1);
    });

    it('has 50MB default max size', () => {
      expect(File.config.maxSize).toBe(50 * 1024 * 1024);
    });
  });
});
