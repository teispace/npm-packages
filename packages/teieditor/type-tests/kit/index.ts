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
