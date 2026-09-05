import degit from 'degit';

/**
 * The starter template every `init`, `setup`, and repair clones from.
 *
 * Pinned by ref, not by branch: the CLI's cleanup lists, injection anchors,
 * and manifests are written against one exact starter shape, and an unpinned
 * `main` let upstream changes break generated projects silently (an added
 * test file orphaned by a cleanup list that did not know about it). Bump the
 * ref deliberately, together with the CLI changes that track it.
 */
export const STARTER_REPO = 'teispace/nextjs-starter';
export const STARTER_REF: string = 'v1.1.0';

export const starterSource = (): string =>
  STARTER_REF === 'main' ? STARTER_REPO : `${STARTER_REPO}#${STARTER_REF}`;

/** Clone the pinned starter into `dest`. Always a fresh fetch, never the degit cache. */
export const cloneStarter = async (
  dest: string,
  options: { verbose?: boolean } = {},
): Promise<void> => {
  const emitter = degit(starterSource(), {
    cache: false,
    force: true,
    verbose: options.verbose ?? false,
  });
  await emitter.clone(dest);
};
