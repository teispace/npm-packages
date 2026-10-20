import { AutoLinkNode, LinkNode } from '@lexical/link';
import { $getRoot, type LexicalEditor } from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { $isEmbedNode, EmbedNode } from '../../src/extensions/embed/embed-node.js';
import { $isFileNode, FileNode } from '../../src/extensions/file/file-node.js';
import { $isImageNode, ImageNode } from '../../src/extensions/image/image-node.js';
import { $deserialize, $serialize } from '../../src/utils/serialization.js';
import { createTestEditor, withEditor } from '../helpers/lexical-test-env.js';

/**
 * Content from outside — pasted HTML, a saved document, a collaborator — must
 * never put a script-running URL into the page or into an export, whichever
 * node it arrives in.
 */

const ATTACKS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  ' \u0000javascript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
];

const DANGEROUS =
  /^\s*(?:javascript|vbscript):|^\s*data:(?:text\/html|image\/svg|application\/xhtml)/i;

const mounted: HTMLElement[] = [];
afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
});

function mountEditor(): LexicalEditor {
  const editor = createTestEditor([LinkNode, AutoLinkNode, ImageNode, EmbedNode, FileNode]);
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.appendChild(root);
  mounted.push(root);
  editor.setRootElement(root);
  return editor;
}

/** Every href and src in a fragment of HTML. */
function urlsIn(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('[href],[src]')].flatMap((el) =>
    ['href', 'src'].map((a) => el.getAttribute(a)).filter((v): v is string => v !== null),
  );
}

function expectNothingDangerous(editor: LexicalEditor, exported: string): void {
  const rendered = editor.getRootElement()?.innerHTML ?? '';
  for (const url of [...urlsIn(rendered), ...urlsIn(exported)]) {
    expect(url, `rendered or exported ${JSON.stringify(url)}`).not.toMatch(DANGEROUS);
  }
}

describe.each(ATTACKS)('%j', (attack) => {
  it('cannot arrive through HTML import', async () => {
    const editor = mountEditor();
    const escaped = attack.replace(/"/g, '&quot;');
    const exported = await withEditor(editor, () => {
      $deserialize(
        `<p><a href="${escaped}">link</a></p><p><img src="${escaped}" alt="x"></p>`,
        'html',
        editor,
      );
      return $serialize('html', editor);
    });
    expectNothingDangerous(editor, exported);
  });

  it('cannot arrive through JSON import, in any node that holds a URL', async () => {
    const editor = mountEditor();
    const text = {
      type: 'text',
      version: 1,
      text: 'x',
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
    };
    const block = { direction: null, format: '', indent: 0, version: 1 };
    const state = JSON.stringify({
      root: {
        ...block,
        type: 'root',
        children: [
          {
            ...block,
            type: 'paragraph',
            textFormat: 0,
            textStyle: '',
            children: [
              {
                ...block,
                type: 'link',
                url: attack,
                rel: null,
                target: null,
                title: null,
                children: [text],
              },
            ],
          },
          {
            type: 'image',
            version: 1,
            src: attack,
            altText: 'x',
            width: 'inherit',
            height: 'inherit',
            caption: '',
          },
          { type: 'embed', version: 1, url: attack, embedType: 'generic' },
          {
            type: 'file',
            version: 1,
            url: attack,
            fileName: 'x',
            fileSize: 1,
            mimeType: 'text/html',
          },
        ],
      },
    });
    editor.setEditorState(editor.parseEditorState(state));

    const { exported, sources } = await withEditor(editor, () => ({
      exported: $serialize('html', editor),
      // Decorator nodes render through React, and what they hold is what gets
      // saved, so check that too.
      sources: $getRoot()
        .getChildren()
        .filter((n) => $isImageNode(n) || $isFileNode(n) || $isEmbedNode(n))
        .map((n) => {
          const json = n.exportJSON() as { url?: string; src?: string };
          return json.url ?? json.src ?? '';
        }),
    }));
    expectNothingDangerous(editor, exported);
    expect(sources).toHaveLength(3);
    for (const source of sources) expect(source).not.toMatch(DANGEROUS);
  });
});

describe('legitimate content survives', () => {
  it('keeps https links, uploaded images and inline file attachments', async () => {
    const editor = mountEditor();
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const exported = await withEditor(editor, () => {
      $deserialize(
        `<p><a href="https://example.com/a">a</a></p><p><img src="${png}" alt="pic"></p>`,
        'html',
        editor,
      );
      return $serialize('html', editor);
    });
    expect(urlsIn(exported)).toEqual(['https://example.com/a', png]);
  });
});
