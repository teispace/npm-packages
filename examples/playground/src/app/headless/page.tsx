import { HeadlessEditor } from './headless-editor';

export default function Page() {
  return (
    <>
      <h1>Headless</h1>
      <p className="lead">
        No ready-made UI: <code>useTeiEditor</code>, <code>EditorContent</code> and your own
        buttons, driven by <code>editor.chain()</code> and lit by <code>useEditorState</code>. The
        document still gets the editor&apos;s content styles; everything else is this page&apos;s.
      </p>
      <HeadlessEditor />
    </>
  );
}
