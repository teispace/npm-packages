import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTeiEditor, defineTeiExtension } from '../../src/index.js';
import {
  Button,
  ColorPicker,
  DropdownMenu,
  EditorProvider,
  Icon,
  Menu,
  type MenuItemData,
  NumberStepper,
  Popover,
  Separator,
  TeiUIContext,
  Toolbar,
} from '../../src/react/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const key = (target: Element, k: string) => fireEvent.keyDown(target, { key: k });
const highlighted = () => document.querySelector('[data-highlighted]')?.textContent;

describe('Menu', () => {
  const items: MenuItemData[] = [
    { id: 'a', label: 'Apple' },
    { id: 'b', label: 'Banana', disabled: true },
    { id: 'c', label: 'Cherry' },
    { id: 'd', label: 'Date' },
  ];

  it('moves with arrows, skips disabled items, wraps, and selects with Enter', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<Menu items={items} label="Fruit" onSelect={onSelect} onClose={onClose} />);
    const menu = screen.getByRole('menu', { name: 'Fruit' });
    expect(document.activeElement).toBe(menu);
    expect(highlighted()).toBe('Apple');
    key(menu, 'ArrowDown');
    expect(highlighted()).toBe('Cherry');
    key(menu, 'End');
    expect(highlighted()).toBe('Date');
    key(menu, 'ArrowDown');
    expect(highlighted()).toBe('Apple');
    key(menu, 'ArrowUp');
    expect(highlighted()).toBe('Date');
    expect(menu.getAttribute('aria-activedescendant')).toBe(
      document.querySelector('[data-highlighted]')?.id,
    );
    key(menu, 'Enter');
    expect(onSelect).toHaveBeenCalledWith(items[3]);
    expect(onClose).toHaveBeenCalledWith('select');
  });

  it('jumps by typeahead, and refines while typing quickly', () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    render(
      <Menu
        items={[...items, { id: 'e', label: 'Cranberry' }, { id: 'f', label: 'Crab apple' }]}
      />,
    );
    const menu = screen.getByRole('menu');
    key(menu, 'd');
    expect(highlighted()).toBe('Date');
    now += 1_000;
    key(menu, 'c'); // the next item starting with "c", after the current one
    expect(highlighted()).toBe('Cranberry');
    now += 1_000;
    key(menu, 'c');
    expect(highlighted()).toBe('Crab apple');
    now += 1_000;
    key(menu, 'c'); // wraps
    expect(highlighted()).toBe('Cherry');
    now += 1_000;
    key(menu, 'c');
    key(menu, 'r');
    key(menu, 'a');
    key(menu, 'b'); // "crab", typed quickly, refines instead of cycling
    expect(highlighted()).toBe('Crab apple');
  });

  it('does not select disabled items on click', () => {
    const onSelect = vi.fn();
    render(<Menu items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Banana'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens a submenu with ArrowRight and comes back with ArrowLeft', () => {
    const picked = vi.fn();
    render(
      <Menu
        items={[
          {
            id: 'turn',
            label: 'Turn into',
            items: [
              { id: 'h1', label: 'Heading 1', onSelect: picked },
              { id: 'h2', label: 'Heading 2' },
            ],
          },
        ]}
      />,
    );
    const outer = screen.getAllByRole('menu')[0] as HTMLElement;
    key(outer, 'ArrowRight');
    const inner = screen.getAllByRole('menu')[1] as HTMLElement;
    expect(document.activeElement).toBe(inner);
    expect(outer.querySelector('[aria-haspopup]')?.getAttribute('aria-expanded')).toBe('true');
    key(inner, 'ArrowLeft');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(document.activeElement).toBe(outer);
    key(outer, 'Enter');
    key(screen.getAllByRole('menu')[1] as HTMLElement, 'Enter');
    expect(picked).toHaveBeenCalledOnce();
  });

  it('marks checkable items', () => {
    render(<Menu items={[{ id: 'x', label: 'Wrap', checked: true }]} />);
    expect(screen.getByRole('menuitemcheckbox').getAttribute('aria-checked')).toBe('true');
  });

  it('marks one-of choices as radio items', () => {
    render(
      <Menu
        items={[
          { id: 'a', label: 'Serif', checked: true, radio: true },
          { id: 'b', label: 'Sans', checked: false, radio: true },
        ]}
      />,
    );
    const [serif, sans] = screen.getAllByRole('menuitemradio');
    expect(serif?.getAttribute('aria-checked')).toBe('true');
    expect(sans?.getAttribute('aria-checked')).toBe('false');
  });
});

describe('Popover', () => {
  it('closes only the innermost layer on Escape', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <Popover open anchor={anchor} onDismiss={outer}>
        <Popover open anchor={anchor} onDismiss={inner}>
          inner
        </Popover>
      </Popover>,
    );
    key(document.body, 'Escape');
    expect(inner).toHaveBeenCalledWith('escape');
    expect(outer).not.toHaveBeenCalled();
    anchor.remove();
  });

  it('stays open on an Escape that cancels an input method’s word', () => {
    const onDismiss = vi.fn();
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <Popover open anchor={anchor} onDismiss={onDismiss}>
        <input aria-label="field" />
      </Popover>,
    );
    const field = screen.getByLabelText('field');
    fireEvent.keyDown(field, { key: 'Escape', isComposing: true });
    // Safari marks it only by its key code.
    fireEvent.keyDown(field, { key: 'Escape', keyCode: 229 });
    expect(onDismiss).not.toHaveBeenCalled();
    key(field, 'Escape');
    expect(onDismiss).toHaveBeenCalledWith('escape');
    anchor.remove();
  });

  it('dismisses on a press outside, but not on its anchor or inside', () => {
    const onDismiss = vi.fn();
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <Popover open anchor={anchor} onDismiss={onDismiss}>
        <span>inside</span>
      </Popover>,
    );
    fireEvent.pointerDown(screen.getByText('inside'));
    fireEvent.pointerDown(anchor);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledWith('outside');
    anchor.remove();
  });
});

describe('DropdownMenu', () => {
  it('opens from the keyboard and returns focus to the button on Escape', () => {
    render(
      <DropdownMenu
        label="Insert"
        icon={[['path', { d: 'M5 12h14' }]]}
        items={[{ id: 'a', label: 'Table' }]}
      />,
    );
    const button = screen.getByRole('button', { name: 'Insert' });
    button.focus();
    key(button, 'ArrowDown');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu', { name: 'Insert' });
    expect(document.activeElement).toBe(menu);
    key(menu, 'Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('Toolbar', () => {
  it('has one tab stop and moves with arrows, Home and End', () => {
    render(
      <Toolbar aria-label="Formatting">
        <Button label="Bold" icon={[]} />
        <Button label="Italic" icon={[]} />
        <Separator />
        <Button label="Link" icon={[]} />
      </Toolbar>,
    );
    const [bold, italic, link] = screen.getAllByRole('button') as HTMLButtonElement[];
    expect([bold?.tabIndex, italic?.tabIndex, link?.tabIndex]).toEqual([0, -1, -1]);
    bold?.focus();
    key(bold as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(italic);
    expect(italic?.tabIndex).toBe(0);
    expect(bold?.tabIndex).toBe(-1);
    key(italic as HTMLElement, 'End');
    expect(document.activeElement).toBe(link);
    key(link as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(bold);
  });
});

describe('Button', () => {
  it('keeps editor focus on mouse press, and names icon-only buttons', () => {
    render(<Button label="Bold" icon={[]} pressed />);
    const button = screen.getByRole('button', { name: 'Bold' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('adds part classes from the UI config, and drops built-ins when unstyled', () => {
    const { rerender } = render(
      <TeiUIContext.Provider value={{ classNames: { button: 'mine' } }}>
        <Button>Go</Button>
      </TeiUIContext.Provider>,
    );
    expect(screen.getByRole('button').className).toBe('tei-button mine');
    rerender(
      <TeiUIContext.Provider value={{ classNames: { button: 'mine' }, unstyled: true }}>
        <Button>Go</Button>
      </TeiUIContext.Provider>,
    );
    expect(screen.getByRole('button').className).toBe('mine');
  });
});

describe('Icon', () => {
  const Ext = defineTeiExtension({
    name: 'test/icons',
    icons: { star: [['path', { d: 'M1 1' }]] },
  });

  it('resolves names through the UI config, then the editor, then the app option', () => {
    const editor = createTeiEditor({ extensions: [Ext] });
    const { container, rerender } = render(
      <EditorProvider editor={editor}>
        <Icon icon="star" />
      </EditorProvider>,
    );
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M1 1');

    rerender(
      <EditorProvider editor={editor}>
        <TeiUIContext.Provider value={{ icons: { star: <i data-testid="mine" /> } }}>
          <Icon icon="star" />
        </TeiUIContext.Provider>
      </EditorProvider>,
    );
    expect(screen.getByTestId('mine')).toBeTruthy();

    const replaced = createTeiEditor({
      extensions: [Ext],
      icons: { star: [['path', { d: 'M2 2' }]] },
    });
    rerender(
      <EditorProvider editor={replaced}>
        <Icon icon="star" />
      </EditorProvider>,
    );
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M2 2');
    editor.destroy();
    replaced.destroy();
  });
});

describe('editor.shortcut', () => {
  it('formats a keymap entry for display, and follows remaps', () => {
    const Ext = defineTeiExtension({
      name: 'test/shortcut',
      commands: { noop: { run: () => true } },
      keymap: { noop: { key: 'Mod-Shift-k', command: 'noop' } },
    });
    const editor = createTeiEditor({ extensions: [Ext] });
    const keys = editor.shortcut('noop');
    expect(keys).toBeDefined();
    expect(keys?.at(-1)?.toUpperCase()).toBe('K');
    expect(keys?.join(' ')).toMatch(/Shift|⇧/);
    expect(editor.shortcut('missing')).toBeUndefined();

    const remapped = createTeiEditor({ extensions: [Ext], keymap: { noop: null } });
    expect(remapped.shortcut('noop')).toBeUndefined();
    editor.destroy();
    remapped.destroy();
  });
});

describe('NumberStepper', () => {
  it('steps, clamps, and commits typed values on Enter', () => {
    function Harness() {
      const [value, setValue] = useState(15);
      return <NumberStepper label="Font size" value={value} onChange={setValue} min={8} max={16} />;
    }
    render(<Harness />);
    const field = screen.getByRole('spinbutton', { name: 'Font size' }) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(field.value).toBe('16');
    expect((screen.getByRole('button', { name: 'Increase' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(field, { target: { value: '3' } });
    key(field, 'Enter');
    expect(field.value).toBe('8');
  });
});

describe('ColorPicker', () => {
  it('marks the current swatch and reports picks', () => {
    const onChange = vi.fn();
    render(
      <ColorPicker
        value="#FF0000"
        onChange={onChange}
        custom={false}
        swatches={[
          { value: null, label: 'Default' },
          { value: '#ff0000', label: 'Red' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Red' }).getAttribute('aria-pressed')).toBe('true');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
