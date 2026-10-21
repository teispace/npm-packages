import { CommentBox } from './comment-box';

export default function Page() {
  return (
    <>
      <h1>Comment box</h1>
      <p className="lead">
        <code>preset="minimal"</code> with a trimmed kit: a toolbar and links, nothing floating.
        ⌘Enter posts; the comment is the editor&apos;s own HTML.
      </p>
      <CommentBox />
    </>
  );
}
