export type StateStore = 'redux' | 'zustand' | 'none';

export interface SliceGeneratorOptions {
  name: string;
  outputPath: string;
  persist: boolean;
  /** Which store the slice targets; `none` is rejected by the command. */
  state?: 'redux' | 'zustand';
}

export interface ApiGeneratorOptions {
  name: string;
  /** Directory of the feature; `api/` is created inside it. */
  featurePath: string;
  /** Emit `actions.ts` with create/update/delete Server Actions. */
  withActions: boolean;
}

export interface FeatureGeneratorOptions {
  name: string;
  outputPath: string;
  createStore: boolean;
  persistStore: boolean;
  /** Emit the `api/` layer (schema, keys, server, actions, queries). */
  createApi: boolean;
  state: StateStore;
  hasI18n: boolean;
  hasTests: boolean;
}
