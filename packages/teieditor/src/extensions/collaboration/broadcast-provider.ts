import type { Provider, ProviderAwareness } from '@lexical/yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { applyUpdate, type Doc, encodeStateAsUpdate, encodeStateVector } from 'yjs';

/** What the provider needs of a `BroadcastChannel`; tests pass their own. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface BroadcastProviderOptions {
  /**
   * How long to wait for another tab to answer before taking this one's
   * document as the whole story (and reporting it synced). Default 150 ms.
   */
  syncTimeout?: number;
  /** Make the channel; defaults to `new BroadcastChannel(name)`. */
  channel?: (name: string) => ChannelLike;
}

type Message =
  /** A tab arrived: "send me what I lack" (its state vector), and its presence. */
  | { type: 'hello'; from: number; sv: Uint8Array }
  /** The answer to a hello: what the newcomer lacked, and what the answerer has. */
  | { type: 'state'; from: number; to: number; update: Uint8Array; sv: Uint8Array }
  | { type: 'update'; from: number; update: Uint8Array }
  | { type: 'awareness'; from: number; update: Uint8Array }
  | { type: 'bye'; from: number };

type Status = 'connecting' | 'connected' | 'disconnected';
type Listener = (arg: never) => void;

/**
 * A Yjs provider between the tabs of one browser, over `BroadcastChannel`:
 * no server, for demos, local testing, and apps that only sync tabs. It
 * speaks @lexical/yjs's Provider interface, with presence (cursors, names)
 * through a y-protocols Awareness.
 *
 * Real collaboration needs a server. Any provider with the same interface
 * plugs into `Collaboration` the same way, e.g. y-websocket:
 *
 * ```ts
 * import { WebsocketProvider } from 'y-websocket';
 * Collaboration.configure({
 *   id: 'doc-42',
 *   provider: (id, docMap) => {
 *     const doc = new Y.Doc();
 *     docMap.set(id, doc);
 *     return new WebsocketProvider('wss://example.com', id, doc, { connect: false });
 *   },
 * });
 * ```
 *
 * or Hocuspocus (`new HocuspocusProvider({ url, name: id, document: doc })`).
 * Let the editor connect: create the provider with `connect: false` where
 * it has the option.
 */
export class BroadcastProvider implements Provider {
  readonly doc: Doc;
  readonly room: string;
  readonly awareness: Awareness & ProviderAwareness;
  #channel: ChannelLike | null = null;
  #listeners = new Map<string, Set<Listener>>();
  #synced = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  readonly #options: BroadcastProviderOptions;

  constructor(room: string, doc: Doc, options: BroadcastProviderOptions = {}) {
    this.room = room;
    this.doc = doc;
    this.#options = options;
    this.awareness = new Awareness(doc) as Awareness & ProviderAwareness;
    doc.on('update', this.#onDocUpdate);
    this.awareness.on('update', this.#onAwarenessUpdate);
  }

  /** Whether the channel is open. */
  get connected(): boolean {
    return this.#channel !== null;
  }

  /** Whether this tab has heard the others' document (or found it was alone). */
  get synced(): boolean {
    return this.#synced;
  }

  connect(): void {
    if (this.#channel) return;
    this.#emit('status', { status: 'connecting' satisfies Status });
    const make =
      this.#options.channel ??
      ((name: string) => new BroadcastChannel(name) as unknown as ChannelLike);
    const channel = make(`teieditor:${this.room}`);
    channel.onmessage = (event) => this.#receive(event.data as Message);
    this.#channel = channel;
    this.#emit('status', { status: 'connected' satisfies Status });
    this.#post({ type: 'hello', from: this.doc.clientID, sv: encodeStateVector(this.doc) });
    this.#postAwareness([this.doc.clientID]);
    // Nobody answered: this tab is alone, and what it has is all there is.
    this.#timer = setTimeout(() => this.#setSynced(true), this.#options.syncTimeout ?? 150);
  }

  disconnect(): void {
    const channel = this.#channel;
    if (!channel) return;
    this.#post({ type: 'bye', from: this.doc.clientID });
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    channel.onmessage = null;
    channel.close();
    this.#channel = null;
    // The others' presence goes with the connection.
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    removeAwarenessStates(this.awareness, others, this);
    this.#setSynced(false);
    this.#emit('status', { status: 'disconnected' satisfies Status });
  }

  /** Disconnect and let go of the document and awareness. */
  destroy(): void {
    this.disconnect();
    this.doc.off('update', this.#onDocUpdate);
    this.awareness.off('update', this.#onAwarenessUpdate);
    this.awareness.destroy();
    this.#listeners.clear();
  }

  on(type: 'sync', cb: (isSynced: boolean) => void): void;
  on(type: 'status', cb: (arg0: { status: string }) => void): void;
  on(type: 'update', cb: (arg0: unknown) => void): void;
  on(type: 'reload', cb: (doc: Doc) => void): void;
  on(type: string, cb: Listener): void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(cb);
  }

  off(type: 'sync', cb: (isSynced: boolean) => void): void;
  off(type: 'status', cb: (arg0: { status: string }) => void): void;
  off(type: 'update', cb: (arg0: unknown) => void): void;
  off(type: 'reload', cb: (doc: Doc) => void): void;
  off(type: string, cb: Listener): void {
    this.#listeners.get(type)?.delete(cb);
  }

  #emit(type: string, arg: unknown): void {
    for (const cb of [...(this.#listeners.get(type) ?? [])]) (cb as (a: unknown) => void)(arg);
  }

  #setSynced(synced: boolean): void {
    if (synced && this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (this.#synced === synced) return;
    this.#synced = synced;
    this.#emit('sync', synced);
  }

  #post(message: Message): void {
    this.#channel?.postMessage(message);
  }

  #postAwareness(clients: number[]): void {
    this.#post({
      type: 'awareness',
      from: this.doc.clientID,
      update: encodeAwarenessUpdate(this.awareness, clients),
    });
  }

  #receive(message: Message): void {
    if (!this.#channel || message.from === this.doc.clientID) return;
    switch (message.type) {
      case 'hello':
        this.#post({
          type: 'state',
          from: this.doc.clientID,
          to: message.from,
          update: encodeStateAsUpdate(this.doc, message.sv),
          sv: encodeStateVector(this.doc),
        });
        // Everyone this tab knows of, so the newcomer sees them all.
        this.#postAwareness([...this.awareness.getStates().keys()]);
        break;
      case 'state':
        if (message.to !== this.doc.clientID) break;
        applyUpdate(this.doc, message.update, this);
        // What the answerer lacks from this tab.
        this.#post({
          type: 'update',
          from: this.doc.clientID,
          update: encodeStateAsUpdate(this.doc, message.sv),
        });
        this.#setSynced(true);
        break;
      case 'update':
        applyUpdate(this.doc, message.update, this);
        break;
      case 'awareness':
        applyAwarenessUpdate(this.awareness, message.update, this);
        break;
      case 'bye':
        removeAwarenessStates(this.awareness, [message.from], this);
        break;
    }
  }

  #onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || !this.#channel) return;
    this.#post({ type: 'update', from: this.doc.clientID, update });
  };

  #onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || !this.#channel) return;
    this.#postAwareness([...added, ...updated, ...removed]);
  };
}

/**
 * A provider that syncs `doc` between the tabs of this browser, in the
 * room `roomName`. See {@link BroadcastProvider}.
 */
export function createBroadcastProvider(
  roomName: string,
  doc: Doc,
  options?: BroadcastProviderOptions,
): BroadcastProvider {
  return new BroadcastProvider(roomName, doc, options);
}
