import { CollabEditors } from './collab-editors';

export default function Page() {
  return (
    <>
      <h1>Collaboration</h1>
      <p className="lead">
        Two people, one document, over Yjs. Each editor has its own document copy, joined
        through a <code>BroadcastChannel</code>: open this page in a second tab and it joins
        too. Swap in <code>y-websocket</code> or Hocuspocus for the network. Save and restore
        named versions from <em>Versions</em>.
      </p>
      <CollabEditors />
    </>
  );
}
