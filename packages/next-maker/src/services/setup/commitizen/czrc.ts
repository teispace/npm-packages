/**
 * The `.czrc` the CLI writes. Shared by the installer and the
 * `doctor --fix` repair path so the two can never drift apart.
 */
export const CZRC_CONTENT = `${JSON.stringify({ path: 'cz-conventional-changelog' }, null, 2)}\n`;
