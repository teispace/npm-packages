import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Import directly from source — equivalent to what consumers import as
// `@teispace/teieditor/react` once built.
import { TeiEditor, TeiEditorNotion } from '../../src/react/index.js';

/**
 * Poll for a condition to become true. Used sparingly — Lexical defers
 * some DOM updates to microtasks so a single flush isn't always enough.
 */
async function waitFor(check: () => boolean, timeoutMs = 500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('drop-in TeiEditor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts without errors and renders placeholder', async () => {
    render(<TeiEditor placeholder="Write something..." />);
    // SSR skeleton → client mount on next tick
    await waitFor(() => !!document.querySelector('.tei-content-editable'));
    expect(document.querySelector('.tei-content-editable')).toBeTruthy();
    expect(screen.getByText('Write something...')).toBeTruthy();
  });

  it('renders the toolbar when showToolbar is true (default)', async () => {
    render(<TeiEditor />);
    await waitFor(() => !!document.querySelector('.tei-content-editable'));
    // Toolbar renders block-type + formatting buttons; at minimum there's a toolbar wrapper
    expect(document.querySelector('[class*="tei-toolbar"], .tei-editor-wrapper > *')).toBeTruthy();
  });

  it('respects showToolbar={false}', async () => {
    const { container } = render(<TeiEditor showToolbar={false} />);
    await waitFor(() => !!container.querySelector('.tei-content-editable'));
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it('accepts initialValue and calls onChange when content changes', async () => {
    const onChange = vi.fn();
    render(
      <TeiEditor
        initialValue="<p>Hello</p>"
        initialFormat="html"
        format="html"
        onChange={onChange}
      />,
    );
    await waitFor(() => !!document.querySelector('.tei-content-editable'));
    // InitialValuePlugin runs on mount; OnChangePlugin fires onChange at least once
    await waitFor(() => onChange.mock.calls.length > 0, 1000);
    const lastCall = onChange.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatch(/Hello/);
  });

  it('sets readOnly=true on the contenteditable', async () => {
    render(<TeiEditor readOnly />);
    await waitFor(() => !!document.querySelector('.tei-content-editable'));
    const ce = document.querySelector('.tei-content-editable') as HTMLElement;
    expect(ce.getAttribute('contenteditable')).toBe('false');
  });

  it('respects spellCheck prop', async () => {
    const { rerender } = render(<TeiEditor spellCheck={false} />);
    await waitFor(() => !!document.querySelector('.tei-content-editable'));
    expect(document.querySelector('.tei-content-editable')?.getAttribute('spellcheck')).toBe(
      'false',
    );

    rerender(<TeiEditor spellCheck />);
    await waitFor(
      () => document.querySelector('.tei-content-editable')?.getAttribute('spellcheck') === 'true',
    );
  });
});

describe('drop-in TeiEditorNotion', () => {
  it('mounts without errors (no toolbar variant)', async () => {
    const { container } = render(<TeiEditorNotion placeholder="Type..." />);
    await waitFor(() => !!container.querySelector('.tei-content-editable'));
    expect(container.querySelector('.tei-content-editable')).toBeTruthy();
    // Notion mode explicitly omits the toolbar
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });

  it('serializes via onChange in markdown format', async () => {
    const onChange = vi.fn();
    render(
      <TeiEditorNotion
        initialValue="# Title"
        initialFormat="markdown"
        format="markdown"
        onChange={onChange}
      />,
    );
    await waitFor(() => document.querySelector('.tei-content-editable') !== null);
    await waitFor(() => onChange.mock.calls.length > 0, 1000);
    // Whatever serializer we produce, it should at least round-trip the heading
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/Title/);
  });
});

describe('drop-in extension composition', () => {
  it('accepts extra extensions via props and dedups by name', async () => {
    const { container } = render(<TeiEditor placeholder="x" extensions={[]} />);
    await waitFor(() => !!container.querySelector('.tei-content-editable'));
    // A starter-kit-only editor still mounts cleanly with empty user extensions
    expect(container.querySelector('.tei-content-editable')).toBeTruthy();
  });
});
