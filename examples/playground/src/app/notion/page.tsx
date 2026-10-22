import { NotionEditor } from './notion-editor';

export default function Page() {
  return (
    <>
      <h1>Notion-style</h1>
      <p className="lead">
        <code>{'preset={notion}'}</code>: no toolbar. Select text to format it, type <code>/</code> for
        blocks. Each empty block says what it is.
      </p>
      <NotionEditor />
    </>
  );
}
