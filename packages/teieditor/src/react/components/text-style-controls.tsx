'use client';

import { useMemo } from 'react';
import { getPeerOptions } from '../../core/define.js';
import type { TeiEditor } from '../../core/editor.js';
import {
  $getFontSize,
  $getTextStyle,
  colorItems,
  fontFamilyItems,
  fontSizeItems,
  type TextStyleOptions,
} from '../../extensions/text-style/items.js';
import { useItemStates } from '../items.js';
import { ColorPicker, NumberStepper } from '../ui/controls.js';
import { DropdownMenu } from '../ui/dropdown.js';
import { Icon } from '../ui/icon.js';
import type { MenuItemData } from '../ui/menu.js';
import { useEditorState } from '../use-editor-state.js';
import type { ToolbarSubmenu } from './editor-toolbar.js';

function useOptions(editor: TeiEditor): Readonly<TextStyleOptions> | undefined {
  return getPeerOptions<TextStyleOptions>(editor.lexical, '@teispace/teieditor/text-style');
}

/** Set a preview font on a menu row through the CSSOM: a strict CSP blocks style attributes. */
const fontPreview = (family: string) => (el: HTMLElement | null) => {
  el?.style.setProperty('font-family', family);
};

/** A menu row's label in its own font, for fonts given as the item's argument. */
function fontRow(family: unknown, text: string): Partial<MenuItemData> {
  return typeof family === 'string'
    ? { label: <span ref={fontPreview(family)}>{text}</span>, textValue: text }
    : {};
}

/** A swatch for a colour row, drawn through the CSSOM. */
function swatch(color: unknown): Partial<MenuItemData> {
  return {
    icon: (
      <span
        className="tei-menu-swatch"
        data-empty={typeof color === 'string' ? undefined : ''}
        ref={(el) => {
          if (el && typeof color === 'string') el.style.setProperty('--tei-swatch', color);
        }}
      />
    ),
  };
}

/** The selection's font, and a menu of the fonts on offer, each shown in itself. */
export function FontFamilyMenu({ editor }: { editor: TeiEditor }) {
  const options = useOptions(editor);
  const items = useMemo(() => (options ? fontFamilyItems(options) : []), [options]);
  const states = useItemStates(editor, items);
  if (!options) return null;
  const current = states.findIndex((state) => state.active);
  const enabled = states.some((state) => state.enabled);
  const shown = editor.t(items[Math.max(current, 0)]?.label ?? '');
  const label = editor.t('style.fontFamily');
  const menu: MenuItemData[] = items.map((item, i) => {
    const text = editor.t(item.label);
    return {
      id: item.id,
      label: text,
      ...fontRow(item.args?.[0], text),
      checked: i === current || (current < 0 && i === 0),
      radio: true,
      disabled: !states[i]?.enabled,
      onSelect: () => editor.runItem(item),
    };
  });
  return (
    <DropdownMenu
      data-item="fontFamily"
      data-tei-control="fontFamily"
      label={`${label}: ${shown}`}
      aria-label={`${label}: ${shown}`}
      menuLabel={label}
      disabled={!enabled}
      items={menu}
    >
      <span className="tei-control-label" data-tei-font>
        {shown}
      </span>
    </DropdownMenu>
  );
}

FontFamilyMenu.overflowMenu = (editor: TeiEditor): ToolbarSubmenu => {
  const options = getPeerOptions<TextStyleOptions>(
    editor.lexical,
    '@teispace/teieditor/text-style',
  );
  return {
    label: editor.t('style.fontFamily'),
    icon: 'fontFamily',
    items: options ? fontFamilyItems(options) : [],
    decorate: (item) => fontRow(item.args?.[0], editor.t(item.label)),
  };
};

/** − [ 16 ] +: the selection's size, stepping along the size scale. */
export function FontSizeStepper({ editor }: { editor: TeiEditor }) {
  const options = useOptions(editor);
  const fallback = options?.defaultFontSize ?? 16;
  const { size, enabled } = useEditorState(
    (e) => ({
      size: e.read(() => $getFontSize(fallback)),
      enabled: e.can().setFontSize(null),
    }),
    { editor, equal: (a, b) => a.size === b.size && a.enabled === b.enabled },
  );
  if (!options) return null;
  return (
    <div data-item="fontSize" data-tei-control="fontSize" className="tei-font-size">
      <NumberStepper
        value={size}
        min={options.minFontSize}
        max={options.maxFontSize}
        label={editor.t('style.fontSize')}
        decrementLabel={editor.t('style.fontSize.decrease')}
        incrementLabel={editor.t('style.fontSize.increase')}
        disabled={!enabled}
        onStep={(direction) =>
          direction > 0 ? editor.commands.increaseFontSize() : editor.commands.decreaseFontSize()
        }
        onChange={(next) => editor.chain().focus().setFontSize(next).run()}
      />
    </div>
  );
}

FontSizeStepper.overflowMenu = (editor: TeiEditor): ToolbarSubmenu => {
  const options = getPeerOptions<TextStyleOptions>(
    editor.lexical,
    '@teispace/teieditor/text-style',
  );
  return {
    label: editor.t('style.fontSize'),
    icon: 'fontSize',
    items: options ? fontSizeItems(options) : [],
  };
};

function colorControl(kind: 'color' | 'backgroundColor') {
  const property = kind === 'color' ? 'color' : 'background-color';
  const icon = kind === 'color' ? 'textColor' : 'backgroundColor';
  const labelId = kind === 'color' ? 'style.color' : 'style.backgroundColor';

  /** The selection's colour on the trigger, and the swatches in a popover. */
  // biome-ignore lint/correctness/noComponentHookFactories: built twice, at module level, below
  function ColorMenu({ editor }: { editor: TeiEditor }) {
    const options = useOptions(editor);
    const { value, enabled } = useEditorState(
      (e) => ({
        value: e.read(() => $getTextStyle(property)),
        enabled: e.can()[kind === 'color' ? 'setColor' : 'setBackgroundColor'](null),
      }),
      { editor, equal: (a, b) => a.value === b.value && a.enabled === b.enabled },
    );
    if (!options) return null;
    const colors = kind === 'color' ? options.colors : options.backgroundColors;
    const label = editor.t(labelId);
    const apply = (color: string | null) =>
      kind === 'color'
        ? editor.chain().focus().setColor(color).run()
        : editor.chain().focus().setBackgroundColor(color).run();
    return (
      <DropdownMenu
        data-item={kind}
        data-tei-control={kind}
        label={label}
        aria-label={label}
        menuLabel={label}
        disabled={!enabled}
        content={(close) => (
          <ColorPicker
            value={value || null}
            swatches={[{ value: null, label: editor.t('style.color.default') }, ...colors]}
            custom={options.customColors}
            customLabel={editor.t('style.color.custom')}
            columns={5}
            onChange={(color) => {
              close();
              apply(color);
            }}
          />
        )}
      >
        <span className="tei-color-icon" data-kind={kind}>
          <Icon icon={icon} />
          <span
            className="tei-color-bar"
            data-empty={value ? undefined : ''}
            ref={(el) => {
              if (el) el.style.setProperty('--tei-current-color', value || 'transparent');
            }}
          />
        </span>
      </DropdownMenu>
    );
  }

  ColorMenu.overflowMenu = (editor: TeiEditor): ToolbarSubmenu => {
    const options = getPeerOptions<TextStyleOptions>(
      editor.lexical,
      '@teispace/teieditor/text-style',
    );
    const colors = kind === 'color' ? options?.colors : options?.backgroundColors;
    return {
      label: editor.t(labelId),
      icon,
      items: colors ? colorItems(kind, colors) : [],
      decorate: (item) => swatch(item.args?.[0]),
    };
  };
  return ColorMenu;
}

/** Text colour: the swatches, a default, and any colour through the system picker. */
export const TextColorMenu = colorControl('color');
/** Highlight colour, the same way. */
export const BackgroundColorMenu = colorControl('backgroundColor');
