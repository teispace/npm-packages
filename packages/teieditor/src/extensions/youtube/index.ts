import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
} from 'lexical';
import { BaseExtension } from '../../core/extension.js';
import type { ExtensionConfig } from '../../core/types.js';
import { $createYouTubeNode, parseYouTubeUrl, YouTubeNode } from './youtube-node.js';

export const INSERT_YOUTUBE_COMMAND: LexicalCommand<string> =
  createCommand('INSERT_YOUTUBE_COMMAND');

class YouTubeExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'youtube';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [YouTubeNode];
  }

  onRegister(editor: LexicalEditor): (() => void) | void {
    return editor.registerCommand(
      INSERT_YOUTUBE_COMMAND,
      (url) => {
        const videoID = parseYouTubeUrl(url);
        if (!videoID) return false;
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const node = $createYouTubeNode(videoID);
          selection.insertNodes([node]);
          const paragraph = $createParagraphNode();
          node.insertAfter(paragraph);
          paragraph.select();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }
}

export const YouTube = new YouTubeExtension();
export {
  $createYouTubeNode,
  $isYouTubeNode,
  parseYouTubeUrl,
  YouTubeNode,
} from './youtube-node.js';
