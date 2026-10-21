import { Showcase } from './showcase';

export default function Page() {
  return (
    <>
      <h1>The editor</h1>
      <p className="lead">
        One element: <code>&lt;Editor /&gt;</code> with StarterKit. Change the preset and the
        rest live; the document stays, because the editor comes from <code>useTeiEditor</code>.
      </p>
      <Showcase />
    </>
  );
}
