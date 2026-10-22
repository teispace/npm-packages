import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Collaboration } from '../../src/extensions/collaboration/index.js';
import { StarterKit } from '../../src/extensions/starter-kit/index.js';
import { Versions } from '../../src/extensions/versions/index.js';
import { createTeiEditor, type TeiEditor } from '../../src/index.js';
import { initials } from '../../src/react/components/collaboration-status.js';
import { CollaborationStatus, VersionsPanel } from '../../src/react/index.js';
import { MemoryNetwork, MemoryProvider, settle } from '../extensions/collab-network.js';

const editors: TeiEditor[] = [];
const providers: MemoryProvider[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const provider of providers.splice(0)) provider.destroy();
  document.body.replaceChildren();
});

function collaborator(network: MemoryNetwork, name: string, color: string) {
  const doc = new Y.Doc();
  const provider = new MemoryProvider(doc, network);
  providers.push(provider);
  const editor = createTeiEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ doc, provider, user: { name, color } }),
    ],
  });
  editors.push(editor);
  return editor;
}

describe('<CollaborationStatus>', () => {
  it('shows the others as avatars, and the connection, live', async () => {
    const network = new MemoryNetwork();
    const me = collaborator(network, 'Me', '#0090ff');
    await settle();
    render(<CollaborationStatus editor={me} showSelf toggle />);
    const group = screen.getByRole('group', { name: 'Collaborators' });
    expect(within(group).getByRole('status').textContent).toBe('Connected');
    expect(within(group).getByRole('list', { name: 'Only you here' })).toBeTruthy();
    expect(within(group).getByText('Me (you)')).toBeTruthy();

    await act(async () => {
      collaborator(network, 'Ada Lovelace', '#e5484d');
      await settle();
    });
    const ada = within(group).getByText('Ada Lovelace').closest('li') as HTMLElement;
    expect(ada.textContent).toContain('AL');
    expect(ada.style.getPropertyValue('--tei-peer-color')).toBe('#e5484d');
    expect(ada.getAttribute('style')).toContain('--tei-peer-color');
    expect(within(group).getByRole('list', { name: '1 other person here' })).toBeTruthy();

    act(() => {
      fireEvent.click(within(group).getByRole('button', { name: 'Go offline' }));
    });
    expect(within(group).getByRole('status').textContent).toBe('Offline');
    expect(within(group).queryByText('Ada Lovelace')).toBeNull();
    act(() => {
      fireEvent.click(within(group).getByRole('button', { name: 'Reconnect' }));
    });
    expect(within(group).getByRole('status').textContent).toBe('Connected');
    expect(within(group).getByText('Ada Lovelace')).toBeTruthy();
  });

  it('folds the rest into "+n"', async () => {
    const network = new MemoryNetwork();
    const me = collaborator(network, 'Me', '#0090ff');
    for (const name of ['A', 'B', 'C', 'D']) collaborator(network, name, '#30a46c');
    await settle();
    render(<CollaborationStatus editor={me} max={2} />);
    expect(screen.getByText('2 more')).toBeTruthy();
    expect(screen.getByRole('list', { name: '4 other people here' })).toBeTruthy();
  });

  it('renders nothing without the extension', () => {
    const editor = createTeiEditor({ extensions: [StarterKit] });
    editors.push(editor);
    const { container } = render(<CollaborationStatus editor={editor} />);
    expect(container.innerHTML).toBe('');
  });

  it('makes initials from names in any script', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('bo')).toBe('BO');
    expect(initials('  ')).toBe('?');
    expect(initials('Émile Zola Jr')).toBe('ÉJ');
    expect(initials('李小龍')).toBe('李小');
  });
});

describe('<VersionsPanel>', () => {
  function setup(content = '<p>One</p>') {
    const editor = createTeiEditor({ extensions: [StarterKit, Versions], content });
    editors.push(editor);
    render(<VersionsPanel editor={editor} locale="en-US" />);
    return editor;
  }

  const addParagraph = (editor: TeiEditor, text: string) =>
    act(() =>
      editor.update(() => {
        $getRoot().append($createParagraphNode().append($createTextNode(text)));
      }),
    );

  it('saves a named version and lists it', () => {
    setup();
    const panel = screen.getByRole('region', { name: 'Version history' });
    expect(within(panel).getByText(/No versions yet/)).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('Version name'), {
      target: { value: 'First draft' },
    });
    act(() => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    });
    expect(within(panel).getByText('First draft')).toBeTruthy();
    expect((within(panel).getByLabelText('Version name') as HTMLInputElement).value).toBe('');
    expect(within(panel).getByText('Saved “First draft”')).toBeTruthy();
    act(() => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    });
    const names = [...panel.querySelectorAll('.tei-version-name')].map((n) => n.textContent);
    expect(names).toEqual(['Version 2', 'First draft']);
  });

  it('previews a version read-only, and compares it with now', () => {
    const editor = setup('<p>The quick fox</p>');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    act(() => editor.setContent('<p>The slow fox</p><p>New</p>'));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    });
    const preview = screen.getByRole('region', { name: 'Preview of “Version 1”' });
    const doc = preview.querySelector('.tei-version-document') as HTMLElement;
    expect(doc.textContent).toBe('The quick fox');
    expect(doc.getAttribute('contenteditable')).toBe('false');
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    act(() => {
      fireEvent.click(within(preview).getByRole('button', { name: 'Compare with now' }));
    });
    const diff = preview.querySelector('[data-tei-version-diff]') as HTMLElement;
    expect(diff.textContent).toContain('1 added, 0 removed, 1 changed');
    expect(diff.querySelector('del')?.textContent).toBe('Removed: quick');
    expect([...diff.querySelectorAll('ins')].map((n) => n.textContent)).toEqual([
      'Added: slow',
      'Added: New',
    ]);
    act(() => {
      fireEvent.click(within(preview).getByRole('button', { name: 'Close preview' }));
    });
    expect(screen.queryByRole('region', { name: /Preview of/ })).toBeNull();
  });

  it('restores only after a confirm, as one undo step', () => {
    const editor = setup('<p>One</p>');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    addParagraph(editor, 'Two');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    });
    const dialog = screen.getByRole('dialog', { name: 'Restore “Version 1”?' });
    // Cancelling leaves the document alone.
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    });
    expect(editor.getText()).toContain('Two');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    });
    act(() => {
      fireEvent.submit(
        screen
          .getByRole('dialog', { name: 'Restore “Version 1”?' })
          .querySelector('form') as HTMLFormElement,
      );
    });
    expect(editor.getText()).toBe('One');
    expect(screen.getByText('Restored “Version 1”')).toBeTruthy();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toContain('Two');
  });

  it('deletes after a confirm', () => {
    setup();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    const dialog = screen.getByRole('dialog', { name: 'Delete “Version 1”?' });
    act(() => {
      fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    });
    expect(screen.queryByText('Version 1')).toBeNull();
    expect(screen.getByText(/No versions yet/)).toBeTruthy();
  });

  it('renders nothing without the extension', () => {
    const editor = createTeiEditor({ extensions: [StarterKit] });
    editors.push(editor);
    const { container } = render(<VersionsPanel editor={editor} />);
    expect(container.innerHTML).toBe('');
  });
});
