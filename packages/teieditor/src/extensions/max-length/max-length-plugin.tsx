import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  PASTE_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

/**
 * Prevents the editor from exceeding a maximum character count.
 */
export function MaxLengthPlugin({ maxLength }: { maxLength: number }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const removeInsert = editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      () => {
        let allow = true;
        editor.getEditorState().read(() => {
          const text = $getRoot().getTextContent();
          if (text.length >= maxLength) allow = false;
        });
        return !allow;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const removePaste = editor.registerCommand(
      PASTE_COMMAND,
      () => {
        let allow = true;
        editor.getEditorState().read(() => {
          const text = $getRoot().getTextContent();
          if (text.length >= maxLength) allow = false;
        });
        return !allow;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    return () => {
      removeInsert();
      removePaste();
    };
  }, [editor, maxLength]);

  return null;
}
