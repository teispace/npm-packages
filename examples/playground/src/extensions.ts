import type { TeiExtensionInput } from '@teispace/teieditor';
import { FileAttachment } from '@teispace/teieditor/extensions/file';
import { Image } from '@teispace/teieditor/extensions/image';
import { Mention, type MentionSearch } from '@teispace/teieditor/extensions/mention';
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

/** The configured stand-ins for the preset's own. */
const CONFIGURED = new Map<TeiExtensionInput, TeiExtensionInput>([
  [Image, Image.configure({ upload: demoUpload })],
  [FileAttachment, FileAttachment.configure({ upload: demoUpload })],
  [Mention, Mention.configure({ search: demoSearch })],
]);

/**
 * What the showcase installs, on the server (for its first HTML) and in the
 * browser alike: the full preset, with uploads and people to mention.
 */
export const EXTENSIONS: TeiExtensionInput[] = full.extensions.map(
  (extension) => CONFIGURED.get(extension) ?? extension,
);
