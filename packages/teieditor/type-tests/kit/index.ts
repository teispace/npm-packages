// What an app sees from the built package (dist), through its exports map.
import { createTeiEditor } from '@teispace/teieditor';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';

const editor = createTeiEditor({ extensions: [StarterKit] });
editor.commands.toggleBold();
editor.chain().focus().toggleHeading(2).setLink('https://x.example').run();
editor.can().undo();
editor.isActive('heading', 2);
// @ts-expect-error: no such command
editor.commands.toggleNothing();
// @ts-expect-error: wrong argument type
editor.commands.toggleHeading('two');

// Content is typed by format.
const html: string = editor.getContent('html');
const json: { root: unknown } = editor.getContent();
void html;
void json;
// @ts-expect-error: HTML is a string
const notJson: { root: unknown } = editor.getContent('html');
void notJson;
// Messages change while the editor runs; plural forms come from `count`.
editor.setMessages({ 'wordCount.words.one': '{count} शब्द' }, 'ne');
const words: string = editor.t('wordCount.words', { count: 2 });
void words;
