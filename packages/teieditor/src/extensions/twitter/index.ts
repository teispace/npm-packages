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
import { $createTweetNode, parseTweetUrl, TweetNode } from './twitter-node.js';

export const INSERT_TWEET_COMMAND: LexicalCommand<string> = createCommand('INSERT_TWEET_COMMAND');

class TwitterExtension extends BaseExtension<ExtensionConfig> {
  readonly name = 'twitter';
  protected readonly defaults = {};

  getNodes(): Array<Klass<LexicalNode>> {
    return [TweetNode];
  }

  onRegister(editor: LexicalEditor): (() => void) | void {
    return editor.registerCommand(
      INSERT_TWEET_COMMAND,
      (url) => {
        const tweetID = parseTweetUrl(url);
        if (!tweetID) return false;
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const node = $createTweetNode(tweetID);
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

export const Twitter = new TwitterExtension();
export { $createTweetNode, $isTweetNode, parseTweetUrl, TweetNode } from './twitter-node.js';
