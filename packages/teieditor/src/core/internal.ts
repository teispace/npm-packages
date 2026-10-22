import type { TeiCommandSpec } from './types.js';

/** The command an override replaced, kept so the override can call it. */
export const PARENT: unique symbol = Symbol('teieditor.parent');
export type WithParent = TeiCommandSpec & { [PARENT]?: TeiCommandSpec };
