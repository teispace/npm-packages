// Importing one extension on its own brings its commands.
import { createTeiEditor } from '@teispace/teieditor';
import { Bold } from '@teispace/teieditor/extensions/formatting';
import { History } from '@teispace/teieditor/extensions/history';

const editor = createTeiEditor({ extensions: [Bold, History] });
editor.commands.toggleBold();
editor.chain().undo().redo().run();
