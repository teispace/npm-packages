import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { deleteDirectory, deleteFile, fileExists, readFile, writeFile } from '../../../core/files';
import { uninstallPackage } from '../../../core/package-manager';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';
import { stripBridgeMount, stripWsReducerRegistration } from '../../setup/ws/injectors';

/**
 * Cleanup applied when the user opts OUT of WebSocket support at `init`.
 *
 * The template ships the WS layer fully wired (ws/ subtree, slice, reducer
 * registration in rootReducer, bridge mount in StoreProvider). Without
 * cleanup, opting out leaves dangling imports that break `yarn build`.
 *
 * Ordering note: this MUST run before `cleanupRedux`. When both are off,
 * `cleanupRedux` nukes the entire `src/store/` directory; our surgical
 * edits to `rootReducer.ts` would be wasted work (though harmless). The
 * `if (answers.redux)` guards below short-circuit those edits cleanly.
 */
export const cleanupWs = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (answers.ws) return;

  // 1. Delete WS source tree + the slice file.
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.WS_UTILS));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.WS_SLICE_FILE));

  // 2. Surgical removals from rootReducer + StoreProvider. Skip when redux
  //    is also off — cleanupRedux is about to delete the whole store.
  if (answers.redux) {
    await removeWsReducerFromRootReducer(projectPath);
    await removeBridgeMountFromStoreProvider(projectPath);
  }

  // 3. Uninstall the dep. Always — even when redux is off (and the bridge
  //    is gone), socket.io-client itself is feature-owned and should leave
  //    cleanly. node_modules churn is cheap compared to leaving an unused
  //    dep in package.json.
  await uninstallSocketIoClient(projectPath);
};

/**
 * Read rootReducer.ts, apply the pure `stripWsReducerRegistration` helper,
 * write back. The helper is shared with the WS manifest's `removePattern`
 * so `init`-opt-out and `remove ws` converge on the same byte output.
 */
const removeWsReducerFromRootReducer = async (projectPath: string): Promise<void> => {
  const rootReducerPath = path.join(projectPath, PROJECT_PATHS.ROOT_REDUCER);
  if (!fileExists(rootReducerPath)) return;
  const before = await readFile(rootReducerPath);
  const after = stripWsReducerRegistration(before);
  if (after !== before) await writeFile(rootReducerPath, after);
};

const removeBridgeMountFromStoreProvider = async (projectPath: string): Promise<void> => {
  const target = path.join(projectPath, PROJECT_PATHS.STORE_PROVIDER);
  if (!fileExists(target)) return;
  const before = await readFile(target);
  const after = stripBridgeMount(before);
  if (after !== before) await writeFile(target, after);
};

/**
 * Uninstall `socket.io-client` if it's listed in package.json. The package
 * manager call is a no-op when the dep isn't present (handled by the
 * underlying tool), so we can call it unconditionally — but the explicit
 * presence check saves a slow yarn/npm invocation in the common case.
 */
const uninstallSocketIoClient = async (projectPath: string): Promise<void> => {
  const pkgJsonPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
  if (!fileExists(pkgJsonPath)) return;
  const pkg = JSON.parse(await readFile(pkgJsonPath));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps['socket.io-client']) return;
  await uninstallPackage(projectPath, 'socket.io-client');
};
