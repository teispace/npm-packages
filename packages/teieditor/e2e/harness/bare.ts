// Plain Lexical, nothing of ours: a baseline to tell our bugs from upstream ones.
import { registerRichText } from '@lexical/rich-text';
import { createEditor } from 'lexical';

const root = document.createElement('div');
root.contentEditable = 'true';
root.dataset.testid = 'bare';
document.body.append(root);
const editor = createEditor({ namespace: 'bare', onError: (e) => console.error(e) });
editor.setRootElement(root);
registerRichText(editor);
(window as unknown as { __bare: typeof editor }).__bare = editor;
