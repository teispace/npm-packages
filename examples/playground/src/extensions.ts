import { FileAttachment } from '@teispace/teieditor/extensions/file';
import { Image } from '@teispace/teieditor/extensions/image';
import { StarterKit } from '@teispace/teieditor/extensions/starter-kit';
import { Table } from '@teispace/teieditor/extensions/table';
import { TextStyle } from '@teispace/teieditor/extensions/text-style';

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

/** What the showcase installs, on the server (for its first HTML) and in the browser alike. */
export const EXTENSIONS = [
  StarterKit,
  TextStyle,
  Table,
  Image.configure({ upload: demoUpload }),
  FileAttachment.configure({ upload: demoUpload }),
];
