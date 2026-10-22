export { readCookieFromString, serializeCookie } from './adapters/cookie';
export type { BuildScriptOptions, ScriptConfig } from './core/script';
export type { CookieOptions } from './core/types';
export { acceptClientHintsHeader, readColorSchemeHint } from './server/client-hint';
export type {
  GetThemeOptions,
  SetThemeCookieOptions,
  ThemeScriptProps,
} from './server/get-theme';
export {
  getTheme,
  getThemeScript,
  getThemeScriptHash,
  getThemeScriptProps,
  setThemeCookie,
  writeThemeCookie,
} from './server/get-theme';
