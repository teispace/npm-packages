import type { TeiExtensionInput } from '@teispace/teieditor';
import { Ai, type AiHandler } from '@teispace/teieditor/extensions/ai';
import { Autocomplete } from '@teispace/teieditor/extensions/autocomplete';
import { CodeShiki } from '@teispace/teieditor/extensions/code-shiki';
import { Comments } from '@teispace/teieditor/extensions/comments';
import { Equation } from '@teispace/teieditor/extensions/equation';
import { Excalidraw } from '@teispace/teieditor/extensions/excalidraw';
import { FileAttachment } from '@teispace/teieditor/extensions/file';
import { Image } from '@teispace/teieditor/extensions/image';
import { Keywords } from '@teispace/teieditor/extensions/keywords';
import { Mention, type MentionSearch } from '@teispace/teieditor/extensions/mention';
import { Review } from '@teispace/teieditor/extensions/review';
import { SpecialText } from '@teispace/teieditor/extensions/special-text';
import { TreeView } from '@teispace/teieditor/extensions/tree-view';
import { full } from '@teispace/teieditor/presets/full';

/**
 * A stand-in for a real upload, so the showcase needs no server: the file
 * comes back as a data URL, its progress paced so you can see it. A real
 * handler sends the file and resolves with its URL.
 */
const demoUpload = (
  file: File,
  { onProgress, signal }: { onProgress: (fraction: number) => void; signal: AbortSignal },
) =>
  new Promise<string>((resolve, reject) => {
    let step = 0;
    const timer = setInterval(() => {
      onProgress(++step / 10);
      if (step < 10) return;
      clearInterval(timer);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }, 80);
    signal.addEventListener('abort', () => {
      clearInterval(timer);
      reject(signal.reason);
    });
  });

/** People to mention, found as a server would: a moment later, by any part of the name. */
const PEOPLE = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Katherine Johnson', 'Linus Torvalds'];
const demoSearch: MentionSearch = (query, { signal }) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const q = query.toLowerCase();
      resolve(
        PEOPLE.filter((name) => name.toLowerCase().includes(q)).map((name) => ({
          id: name.toLowerCase().replace(/\s+/g, '-'),
          label: name,
        })),
      );
    }, 120);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

/**
 * A stand-in for a model, so the AI menu works with no key: a canned answer
 * per action, streamed a word at a time. A real handler sends `request` to
 * your model (through your server) and returns its stream.
 */
const demoAi: AiHandler = async function* (request, { signal }) {
  const text = request.selection.text.trim();
  const answers: Record<string, string> = {
    continue: 'and the rest follows from there, one clear step at a time.',
    summarize: `In short: ${text.split(/\s+/).slice(0, 12).join(' ')}…`,
    shorter: text.split(/\s+/).slice(0, Math.max(3, text.split(/\s+/).length >> 1)).join(' '),
    longer: `${text} To put it another way, there is more to say here, and this says it.`,
    fix: text.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    translate: `[${request.options.language ?? 'translated'}] ${text}`,
    tone: `[${request.options.tone ?? 'new tone'}] ${text}`,
  };
  const answer =
    answers[request.action] ??
    `A demo answer to “${request.prompt ?? request.id}”. Connect a model to get a real one.`;
  for (const word of answer.split(/(?<= )/)) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (signal.aborted) return;
    yield word;
  }
};

/** Who is writing: the author of new comments and suggestions. */
const ME = { id: 'ada', name: 'Ada Lovelace', color: '#2563eb' };

/** The configured stand-ins for the preset's own. */
const CONFIGURED = new Map<TeiExtensionInput, TeiExtensionInput>([
  [Image, Image.configure({ upload: demoUpload })],
  [FileAttachment, FileAttachment.configure({ upload: demoUpload })],
  [Mention, Mention.configure({ search: demoSearch })],
  [Comments, Comments.configure({ user: ME })],
]);

/**
 * What the showcase installs, on the server (for its first HTML) and in the
 * browser alike: the full preset, with uploads, people to mention and a demo AI,
 * plus equations, drawings, suggested changes, marked keywords, `[special]`
 * text and the tree view.
 */
export const EXTENSIONS: TeiExtensionInput[] = [
  ...full.extensions.map((extension) => CONFIGURED.get(extension) ?? extension),
  Ai.configure({ handler: demoAi }),
  // Each needs a package of its own (katex, @excalidraw/excalidraw), loaded when first used.
  Equation,
  Excalidraw,
  Review.configure({ user: ME }),
  // Marked where they appear, never saved: CSS highlights over the text.
  Keywords.configure({ keywords: ['teieditor', 'Lexical', /\bTODO\b/] }),
  SpecialText,
  // A developer tool: the node tree, from the document menu.
  TreeView,
];

/** The settings that change which extensions are installed. */
export interface ExtensionSettings {
  /** Colour code with Shiki (VS Code's grammars) in place of Prism. */
  shiki: boolean;
  /** Suggest the rest of a word as you type; Tab takes it. */
  autocomplete: boolean;
}

/** {@link EXTENSIONS}, with the settings' extras. */
export const extensionsFor = ({ shiki, autocomplete }: ExtensionSettings): TeiExtensionInput[] => [
  ...EXTENSIONS,
  // Installed alongside Prism, it switches Prism off.
  ...(shiki ? [CodeShiki] : []),
  ...(autocomplete ? [Autocomplete] : []),
];
