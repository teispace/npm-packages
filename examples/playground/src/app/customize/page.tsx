import { CustomEditor } from './custom-editor';

export default function Page() {
  return (
    <>
      <h1>Customize</h1>
      <p className="lead">
        The same <code>&lt;Editor&gt;</code>, changed through options only: a toolbar layout, an
        item of your own (in the toolbar and the slash menu), items hidden, a word renamed, a
        shortcut remapped (⌘⇧X strikes through), and the colours from a few tokens.
      </p>
      <CustomEditor />
    </>
  );
}
