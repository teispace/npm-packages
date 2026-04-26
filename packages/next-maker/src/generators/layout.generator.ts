import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import { fileExists, writeFile } from '../core/files';
import { layoutTemplate } from './templates/layout.template';

export interface LayoutGeneratorOptions {
  /**
   * The leaf segment for the layout, e.g. `dashboard` or `marketing`. Route
   * groups are expressed via `withGroup: true` rather than encoding parens
   * into the segment string — keeps validation simple.
   */
  segment: string;
  /** Optional path under the locale root, e.g. `dashboard/settings`. The leaf becomes the layout. */
  at?: string;
  projectPath: string;
  hasI18n: boolean;
  /** Wraps the leaf segment in parens to form a route group `(marketing)`. */
  withGroup: boolean;
}

export interface LayoutGeneratorResult {
  layoutFile: string;
  /** Display path for logging, e.g. `src/app/[locale]/(marketing)/layout.tsx`. */
  displayPath: string;
  componentName: string;
}

const SEGMENT_RE = /^[a-z][a-z0-9-]*$/;
const SEGMENT_LIST_RE = /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/;

const validateSegment = (segment: string): void => {
  if (!SEGMENT_RE.test(segment)) {
    throw new Error(
      `Invalid layout segment "${segment}". Use kebab-case letters, digits, and hyphens. ` +
        'For route groups pass --group instead of wrapping in parens.',
    );
  }
};

const validateAt = (at: string): void => {
  if (!SEGMENT_LIST_RE.test(at)) {
    throw new Error(
      `Invalid --at path "${at}". Use kebab-case segments separated by "/", e.g. "dashboard/settings".`,
    );
  }
};

export const generateLayout = async (
  options: LayoutGeneratorOptions,
): Promise<LayoutGeneratorResult> => {
  const { segment, at, projectPath, hasI18n, withGroup } = options;

  validateSegment(segment);
  if (at) validateAt(at);

  const componentName = `${kebabToPascal(segment)}Layout`;
  const leaf = withGroup ? `(${segment})` : segment;

  const baseSegments = ['src', 'app'];
  if (hasI18n) baseSegments.push('[locale]');
  if (at) baseSegments.push(...at.split('/'));
  baseSegments.push(leaf);

  const targetDir = path.join(projectPath, ...baseSegments);
  const layoutFile = path.join(targetDir, 'layout.tsx');

  if (fileExists(layoutFile)) {
    throw new Error(`Layout already exists at ${path.relative(projectPath, layoutFile)}.`);
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(layoutFile, layoutTemplate({ componentName, hasI18n }));

  return {
    layoutFile,
    displayPath: path.relative(projectPath, layoutFile),
    componentName,
  };
};
