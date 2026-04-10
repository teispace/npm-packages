import { describe, expect, it } from 'vitest';
import { Alignment } from '../../src/extensions/alignment/index.js';
import { Color } from '../../src/extensions/color/index.js';
import { DragHandle } from '../../src/extensions/drag-handle/index.js';
import { Emoji } from '../../src/extensions/emoji/index.js';
import { FindReplace } from '../../src/extensions/find-replace/index.js';
import { FontFamily } from '../../src/extensions/font-family/index.js';
import { FontSize } from '../../src/extensions/font-size/index.js';
import { Markdown } from '../../src/extensions/markdown/index.js';
import { Math } from '../../src/extensions/math/index.js';
import { Mention } from '../../src/extensions/mention/index.js';
import { Placeholder } from '../../src/extensions/placeholder/index.js';
import { defaultSlashCommands, SlashCommand } from '../../src/extensions/slash-command/index.js';
import { WordCount } from '../../src/extensions/word-count/index.js';

describe('Advanced Extensions', () => {
  describe('Mention', () => {
    it('has name "mention"', () => {
      expect(Mention.name).toBe('mention');
    });

    it('registers MentionNode', () => {
      expect(Mention.getNodes!().length).toBe(1);
    });

    it('defaults to @ trigger', () => {
      expect(Mention.config.trigger).toBe('@');
    });

    it('can configure trigger', () => {
      const m = Mention.configure({ trigger: '#' });
      expect(m.config.trigger).toBe('#');
    });

    it('can configure onSearch', () => {
      const search = async () => [{ id: '1', name: 'Test' }];
      const m = Mention.configure({ onSearch: search });
      expect(m.config.onSearch).toBe(search);
    });
  });

  describe('Emoji', () => {
    it('has name "emoji"', () => {
      expect(Emoji.name).toBe('emoji');
    });

    it('defaults to empty extra emojis', () => {
      expect(Emoji.config.extraEmojis).toEqual([]);
    });

    it('provides a plugin', () => {
      expect(Emoji.getPlugins!().length).toBe(1);
    });
  });

  describe('Markdown', () => {
    it('has name "markdown"', () => {
      expect(Markdown.name).toBe('markdown');
    });

    it('defaults to shortcuts enabled', () => {
      expect(Markdown.config.shortcuts).toBe(true);
    });

    it('provides plugin when shortcuts enabled', () => {
      expect(Markdown.getPlugins!().length).toBe(1);
    });

    it('provides no plugins when shortcuts disabled', () => {
      const md = Markdown.configure({ shortcuts: false });
      expect(md.getPlugins!().length).toBe(0);
    });
  });

  describe('FindReplace', () => {
    it('has name "findReplace"', () => {
      expect(FindReplace.name).toBe('findReplace');
    });

    it('defaults to Mod+F shortcut', () => {
      expect(FindReplace.config.shortcut).toBe('Mod+F');
    });

    it('has keyboard binding', () => {
      const bindings = FindReplace.getKeyBindings!();
      expect(bindings).toHaveProperty('Mod+F');
    });
  });

  describe('WordCount', () => {
    it('has name "wordCount"', () => {
      expect(WordCount.name).toBe('wordCount');
    });

    it('defaults to showing characters', () => {
      expect(WordCount.config.showCharacters).toBe(true);
    });
  });

  describe('Math', () => {
    it('has name "math"', () => {
      expect(Math.name).toBe('math');
    });

    it('registers MathNode', () => {
      expect(Math.getNodes!().length).toBe(1);
    });
  });

  describe('Alignment', () => {
    it('has name "alignment"', () => {
      expect(Alignment.name).toBe('alignment');
    });

    it('defaults to all alignments', () => {
      expect(Alignment.config.alignments).toEqual(['left', 'center', 'right', 'justify']);
    });

    it('has keyboard shortcuts', () => {
      const bindings = Alignment.getKeyBindings!();
      expect(bindings).toHaveProperty('Mod+Shift+L');
      expect(bindings).toHaveProperty('Mod+Shift+E');
      expect(bindings).toHaveProperty('Mod+Shift+R');
      expect(bindings).toHaveProperty('Mod+Shift+J');
      expect(bindings).toHaveProperty('Tab');
      expect(bindings).toHaveProperty('Shift+Tab');
    });
  });

  describe('FontSize', () => {
    it('has name "fontSize"', () => {
      expect(FontSize.name).toBe('fontSize');
    });

    it('has default sizes', () => {
      expect(FontSize.config.sizes.length).toBeGreaterThan(0);
      expect(FontSize.config.defaultSize).toBe('16px');
    });
  });

  describe('FontFamily', () => {
    it('has name "fontFamily"', () => {
      expect(FontFamily.name).toBe('fontFamily');
    });

    it('has default families', () => {
      expect(FontFamily.config.families.length).toBeGreaterThan(0);
    });
  });

  describe('Color', () => {
    it('has name "color"', () => {
      expect(Color.name).toBe('color');
    });

    it('has default color palette', () => {
      expect(Color.config.colors.length).toBeGreaterThan(0);
    });
  });

  describe('SlashCommand', () => {
    it('has name "slashCommand"', () => {
      expect(SlashCommand.name).toBe('slashCommand');
    });

    it('has default commands', () => {
      expect(SlashCommand.config.commands.length).toBeGreaterThan(0);
    });

    it('defaultSlashCommands has expected items', () => {
      const names = defaultSlashCommands.map((c) => c.name);
      expect(names).toContain('paragraph');
      expect(names).toContain('heading1');
      expect(names).toContain('bulletList');
      expect(names).toContain('codeBlock');
      expect(names).toContain('image');
      expect(names).toContain('table');
    });

    it('all commands have required fields', () => {
      for (const cmd of defaultSlashCommands) {
        expect(cmd.name).toBeTruthy();
        expect(cmd.label).toBeTruthy();
        expect(typeof cmd.onSelect).toBe('function');
      }
    });
  });

  describe('DragHandle', () => {
    it('has name "dragHandle"', () => {
      expect(DragHandle.name).toBe('dragHandle');
    });

    it('provides a plugin', () => {
      expect(DragHandle.getPlugins!().length).toBe(1);
    });
  });

  describe('Placeholder', () => {
    it('has name "placeholder"', () => {
      expect(Placeholder.name).toBe('placeholder');
    });

    it('has default placeholders', () => {
      const p = Placeholder.config.placeholders;
      expect(p).toHaveProperty('root');
      expect(p).toHaveProperty('paragraph');
      expect(p).toHaveProperty('heading');
    });

    it('can configure custom placeholders', () => {
      const custom = Placeholder.configure({
        placeholders: { root: 'Custom...', paragraph: '' },
      });
      expect(custom.config.placeholders.root).toBe('Custom...');
    });
  });
});
