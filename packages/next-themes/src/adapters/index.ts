import type { CookieOptions, StorageMode } from '../core/types';
import { cookieAdapter } from './cookie';
import { hybridAdapter } from './hybrid';
import { localAdapter } from './local';
import { sessionAdapter } from './session';
import type { AdapterOptions, StorageAdapter } from './types';

export { readCookieFromString, serializeCookie } from './cookie';
export type { AdapterFactory, AdapterOptions, StorageAdapter } from './types';
export { cookieAdapter, hybridAdapter, localAdapter, sessionAdapter };

export interface ResolveAdapterOptions {
  mode: StorageMode;
  key: string;
  cookieOptions?: CookieOptions;
}

export function resolveAdapter(opts: ResolveAdapterOptions): StorageAdapter {
  if (opts.mode === 'none') {
    return { get: () => null, set: () => {} };
  }
  const adapterOpts: AdapterOptions = {
    key: opts.key,
    cookie: {
      name: opts.cookieOptions?.name ?? opts.key,
      maxAge: opts.cookieOptions?.maxAge,
      path: opts.cookieOptions?.path,
      domain: opts.cookieOptions?.domain,
      sameSite: opts.cookieOptions?.sameSite,
      secure: opts.cookieOptions?.secure,
    },
  };
  switch (opts.mode) {
    case 'cookie':
      return cookieAdapter(adapterOpts);
    case 'hybrid':
      return hybridAdapter(adapterOpts);
    case 'local':
      return localAdapter(adapterOpts);
    case 'session':
      return sessionAdapter(adapterOpts);
  }
}
