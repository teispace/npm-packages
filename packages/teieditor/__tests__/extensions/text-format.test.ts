import { describe, expect, it } from 'vitest';
import { Bold } from '../../src/extensions/bold/index.js';
import { InlineCode } from '../../src/extensions/code/index.js';
import { Highlight } from '../../src/extensions/highlight/index.js';
import { Italic } from '../../src/extensions/italic/index.js';
import { Strikethrough } from '../../src/extensions/strikethrough/index.js';
import { Subscript } from '../../src/extensions/subscript/index.js';
import { Superscript } from '../../src/extensions/superscript/index.js';
import { Underline } from '../../src/extensions/underline/index.js';

const ALL_TEXT_FORMATS = [
  { ext: Bold, name: 'bold', shortcut: 'Mod+B' },
  { ext: Italic, name: 'italic', shortcut: 'Mod+I' },
  { ext: Underline, name: 'underline', shortcut: 'Mod+U' },
  { ext: Strikethrough, name: 'strikethrough', shortcut: 'Mod+Shift+S' },
  { ext: InlineCode, name: 'code', shortcut: 'Mod+E' },
  { ext: Highlight, name: 'highlight', shortcut: 'Mod+Shift+H' },
  { ext: Subscript, name: 'subscript', shortcut: undefined },
  { ext: Superscript, name: 'superscript', shortcut: undefined },
];

describe('Text Format Extensions', () => {
  for (const { ext, name, shortcut } of ALL_TEXT_FORMATS) {
    describe(name, () => {
      it(`has name "${name}"`, () => {
        expect(ext.name).toBe(name);
      });

      it('has no nodes (text formats use Lexical built-ins)', () => {
        expect(ext.getNodes).toBeUndefined();
      });

      it('has no plugins', () => {
        expect(ext.getPlugins).toBeUndefined();
      });

      if (shortcut) {
        it(`has keyboard shortcut ${shortcut}`, () => {
          const bindings = ext.getKeyBindings?.();
          expect(bindings).toBeDefined();
          expect(bindings).toHaveProperty(shortcut);
        });
      } else {
        it('has no keyboard shortcut', () => {
          const bindings = ext.getKeyBindings?.();
          expect(bindings).toEqual({});
        });
      }

      it('can be configured with a custom shortcut', () => {
        const configured = ext.configure({ shortcut: 'Mod+Shift+X' });
        const bindings = configured.getKeyBindings?.();
        expect(bindings).toHaveProperty('Mod+Shift+X');
      });
    });
  }
});
