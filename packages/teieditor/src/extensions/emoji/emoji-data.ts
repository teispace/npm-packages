export interface EmojiItem {
  emoji: string;
  name: string;
  keywords: string[];
}

/** Compact emoji dataset — extend as needed. */
export const EMOJI_LIST: EmojiItem[] = [
  // Smileys
  { emoji: '😀', name: 'grinning face', keywords: ['happy', 'smile'] },
  { emoji: '😂', name: 'face with tears of joy', keywords: ['laugh', 'lol'] },
  { emoji: '🥹', name: 'face holding back tears', keywords: ['touched', 'emotional'] },
  { emoji: '😊', name: 'smiling face', keywords: ['blush', 'happy'] },
  { emoji: '😍', name: 'heart eyes', keywords: ['love', 'like'] },
  { emoji: '🤔', name: 'thinking face', keywords: ['think', 'hmm'] },
  { emoji: '😅', name: 'sweat smile', keywords: ['nervous', 'relief'] },
  { emoji: '😢', name: 'crying face', keywords: ['sad', 'cry'] },
  { emoji: '😡', name: 'angry face', keywords: ['mad', 'angry'] },
  { emoji: '🥳', name: 'partying face', keywords: ['party', 'celebrate'] },
  { emoji: '🤯', name: 'exploding head', keywords: ['mind blown', 'shocked'] },
  { emoji: '😴', name: 'sleeping face', keywords: ['sleep', 'zzz'] },
  // Gestures
  { emoji: '👍', name: 'thumbs up', keywords: ['like', 'approve', 'yes'] },
  { emoji: '👎', name: 'thumbs down', keywords: ['dislike', 'no'] },
  { emoji: '👏', name: 'clapping hands', keywords: ['clap', 'bravo'] },
  { emoji: '🙏', name: 'folded hands', keywords: ['thanks', 'pray', 'please'] },
  { emoji: '💪', name: 'flexed bicep', keywords: ['strong', 'muscle'] },
  { emoji: '🤝', name: 'handshake', keywords: ['deal', 'agree'] },
  { emoji: '✌️', name: 'victory hand', keywords: ['peace', 'v'] },
  { emoji: '🫡', name: 'saluting face', keywords: ['salute', 'respect'] },
  // Objects
  { emoji: '🔥', name: 'fire', keywords: ['hot', 'lit'] },
  { emoji: '❤️', name: 'red heart', keywords: ['love', 'heart'] },
  { emoji: '⭐', name: 'star', keywords: ['star', 'favorite'] },
  { emoji: '✅', name: 'check mark', keywords: ['done', 'complete', 'yes'] },
  { emoji: '❌', name: 'cross mark', keywords: ['no', 'wrong', 'delete'] },
  { emoji: '⚠️', name: 'warning', keywords: ['warn', 'caution'] },
  { emoji: '💡', name: 'light bulb', keywords: ['idea', 'tip'] },
  { emoji: '🎉', name: 'party popper', keywords: ['celebrate', 'congrats'] },
  { emoji: '📌', name: 'pushpin', keywords: ['pin', 'important'] },
  { emoji: '🚀', name: 'rocket', keywords: ['launch', 'fast', 'ship'] },
  { emoji: '💻', name: 'laptop', keywords: ['computer', 'code'] },
  { emoji: '📝', name: 'memo', keywords: ['note', 'write'] },
  { emoji: '📎', name: 'paperclip', keywords: ['attach', 'file'] },
  { emoji: '🔗', name: 'link', keywords: ['url', 'chain'] },
  { emoji: '📊', name: 'bar chart', keywords: ['chart', 'stats', 'data'] },
  { emoji: '🗂️', name: 'card index', keywords: ['folder', 'organize'] },
  { emoji: '⏰', name: 'alarm clock', keywords: ['time', 'deadline'] },
  { emoji: '🏷️', name: 'label', keywords: ['tag', 'price'] },
  { emoji: '🔒', name: 'locked', keywords: ['lock', 'secure', 'private'] },
  { emoji: '🌍', name: 'globe', keywords: ['earth', 'world', 'global'] },
];
