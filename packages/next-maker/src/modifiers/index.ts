export { registerApiEndpoints } from './api-registration.modifier';
export { registerAppPath } from './app-paths.modifier';
export {
  type AddEnvVarResult,
  addEnvVar,
  appendEnvEntry,
  appendEnvExampleEntry,
  buildSchemaEntry,
  type EnvVarSpec,
  type EnvVarType,
  ensurePublicPrefix,
  injectSchemaEntry,
  validateName as validateEnvVarName,
} from './env-var.modifier';
export { addImportStatement, addToAppApis, addToCombineReducers } from './helpers';
export {
  addProviderToBarrel,
  findRootProviderFile,
  injectProviderIntoChain,
  type RegisterProviderOptions,
  registerProvider,
} from './root-provider.modifier';
export { registerInRootReducer } from './root-reducer.modifier';
export { addTranslationNamespace } from './translation.modifier';
export type { RegisterApiOptions, RegisterReducerOptions } from './types';
