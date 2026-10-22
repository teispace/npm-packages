// An in-memory Yjs network for the collaboration tests: providers that
// speak @lexical/yjs's Provider interface, delivering updates and presence
// synchronously between the connected ones. `partition()` cuts them off from
// each other (each still reports sync, as a lone client would); `heal()`
// syncs everyone connected again.

import type { Provider } from '@lexical/yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import * as Y from 'yjs';

type Listener = (arg: never) => void;

export class MemoryNetwork {
  readonly providers = new Set<MemoryProvider>();
  partitioned = false;

  partition(): void {
    this.partitioned = true;
  }

  heal(): void {
    this.partitioned = false;
    const live = [...this.providers].filter((p) => p.connected);
    for (const a of live) for (const b of live) if (a !== b) a.syncWith(b);
  }

  reachable(from: MemoryProvider): MemoryProvider[] {
    if (this.partitioned) return [];
    return [...this.providers].filter((p) => p !== from && p.connected);
  }
}

export class MemoryProvider implements Provider {
  readonly awareness: Awareness & Provider['awareness'];
  connected = false;
  connects = 0;
  #listeners = new Map<string, Set<Listener>>();

  constructor(
    readonly doc: Y.Doc,
    readonly network: MemoryNetwork,
  ) {
    this.awareness = new Awareness(doc) as Awareness & Provider['awareness'];
    network.providers.add(this);
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === this || !this.connected) return;
      for (const peer of network.reachable(this)) Y.applyUpdate(peer.doc, update, peer);
    });
    this.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin === this || !this.connected) return;
        const update = encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]);
        for (const peer of network.reachable(this))
          applyAwarenessUpdate(peer.awareness, update, peer);
      },
    );
  }

  /** Exchange documents and presence with another provider, both ways. */
  syncWith(other: MemoryProvider): void {
    Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(other.doc, Y.encodeStateVector(this.doc)), this);
    Y.applyUpdate(
      other.doc,
      Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(other.doc)),
      other,
    );
    applyAwarenessUpdate(
      this.awareness,
      encodeAwarenessUpdate(other.awareness, [...other.awareness.getStates().keys()]),
      this,
    );
    applyAwarenessUpdate(
      other.awareness,
      encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()]),
      other,
    );
  }

  connect(): void {
    this.connects++;
    this.emit('status', { status: 'connecting' });
    this.connected = true;
    this.emit('status', { status: 'connected' });
    for (const peer of this.network.reachable(this)) this.syncWith(peer);
    this.emit('sync', true);
  }

  disconnect(): void {
    if (!this.connected) return;
    for (const peer of this.network.reachable(this))
      removeAwarenessStates(peer.awareness, [this.doc.clientID], peer);
    this.connected = false;
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    removeAwarenessStates(this.awareness, others, this);
    this.emit('sync', false);
    this.emit('status', { status: 'disconnected' });
  }

  on(type: string, cb: Listener): void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(cb);
  }

  off(type: string, cb: Listener): void {
    this.#listeners.get(type)?.delete(cb);
  }

  listenerCount(type: string): number {
    return this.#listeners.get(type)?.size ?? 0;
  }

  emit(type: string, arg: unknown): void {
    for (const cb of [...(this.#listeners.get(type) ?? [])]) (cb as (a: unknown) => void)(arg);
  }

  destroy(): void {
    this.disconnect();
    this.awareness.destroy();
    this.network.providers.delete(this);
  }
}

/** Let microtasks and Lexical's queued updates run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
