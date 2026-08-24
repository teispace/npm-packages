/**
 * Validation as a list of rules, rather than one hardcoded function.
 *
 * Every check below is an independent {@link ValidationRule}, which means a
 * consumer can disable one they disagree with, adjust a threshold, or add a
 * house rule ("our codes must always be level Q or better") without forking
 * the package. The built-in set is exported so a custom rule can be composed
 * alongside it rather than replacing it.
 */

import type { QrMatrix } from '../core/types.js';
import { logoGeometry } from '../render/logo.js';
import { SAFETY_NOTE, styleSafety } from '../render/safety.js';
import type { QrStyle } from '../render/types.js';
import type { CoverageReport } from './coverage.js';
import type { PrintSizeReport } from './printsize.js';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  readonly level: IssueLevel;
  /** Stable identifier, so a UI can attach a fix to a specific issue. */
  readonly code: string;
  readonly title: string;
  readonly detail: string;
}

/** Everything a rule may inspect. Derived values are computed once and shared. */
export interface ValidationContext {
  readonly matrix: QrMatrix;
  readonly style: QrStyle;
  /** Worst-case foreground/background contrast, or null when unmeasurable. */
  readonly contrast: number | null;
  /** True when the code is light-on-dark. */
  readonly inverted: boolean;
  /** Exact logo damage analysis, or null when there is no logo. */
  readonly coverage: CoverageReport | null;
  readonly print: PrintSizeReport;
  /** Distance the code will be scanned from, in millimetres. */
  readonly scanDistanceMm: number;
  readonly dpi: number;
}

/** One independent check. Return nothing when the rule has no complaint. */
export interface ValidationRule {
  /** Stable id, used to disable or override the rule. */
  readonly id: string;
  /** One line describing what the rule guards against. */
  readonly description: string;
  check(context: ValidationContext): Issue | Issue[] | null | undefined;
}

/**
 * Minimum contrast that reads reliably. Well below the WCAG 4.5:1 used for
 * text, because a scanner only has to separate two populations of pixels, not
 * resolve letterforms. Below 3:1, camera noise and uneven lighting start
 * merging them.
 */
export const MIN_CONTRAST = 3;
export const COMFORTABLE_CONTRAST = 7;
/** Above this share of the error correction budget, a logo has no headroom left. */
export const LOGO_BUDGET_WARN = 0.7;

const contrastRule: ValidationRule = {
  id: 'contrast',
  description: 'Foreground and background must be separable by a camera.',
  check({ contrast }) {
    if (contrast === null) {
      return {
        level: 'info',
        code: 'contrast-unknown',
        title: 'Contrast could not be measured',
        detail: 'One of the colours is not a plain hex value, so contrast was not checked.',
      };
    }
    if (contrast < MIN_CONTRAST) {
      return {
        level: 'error',
        code: 'contrast-low',
        title: `Contrast is only ${contrast.toFixed(1)}:1`,
        detail:
          'Below 3:1 most scanners cannot separate dark modules from the background. Darken the modules or lighten the background.',
      };
    }
    if (contrast < COMFORTABLE_CONTRAST) {
      return {
        level: 'warning',
        code: 'contrast-marginal',
        title: `Contrast is ${contrast.toFixed(1)}:1`,
        detail:
          'This scans in good light but leaves little margin for a dim room, a glossy surface, or a cheap camera. Aim for 7:1 or better.',
      };
    }
    return null;
  },
};

const invertedRule: ValidationRule = {
  id: 'inverted',
  description: 'Some readers only look for dark modules on a light background.',
  check({ inverted }) {
    if (!inverted) return null;
    return {
      level: 'warning',
      code: 'inverted',
      title: 'Light code on a dark background',
      detail:
        'Phone cameras handle this, but some point-of-sale and industrial readers only look for dark modules on a light background.',
    };
  },
};

const quietZoneRule: ValidationRule = {
  id: 'quiet-zone',
  description: 'The specification requires four clear modules on every side.',
  check({ style }) {
    if (style.quietZone >= 4) return null;
    return {
      level: style.quietZone === 0 ? 'error' : 'warning',
      code: 'quiet-zone',
      title: `Quiet zone is ${style.quietZone} modules`,
      detail:
        'The specification requires 4 modules of clear space on every side. Less than that and scanners struggle to find the code against a busy background.',
    };
  },
};

const shapeSafetyRule: ValidationRule = {
  id: 'shape-safety',
  description: 'Decorative shapes cost measurable detection margin.',
  check({ style }) {
    const safety = styleSafety(style);
    if (safety === 'safe') return null;
    return {
      level: safety === 'poor' ? 'error' : 'warning',
      code: `shape-${safety}`,
      title: safety === 'poor' ? 'These shapes often fail to scan' : 'Decorative shapes in use',
      detail: SAFETY_NOTE[safety],
    };
  },
};

const logoRule: ValidationRule = {
  id: 'logo-coverage',
  description: 'A logo must not destroy more than error correction can recover.',
  check({ coverage }) {
    if (!coverage) return null;
    if (coverage.breaksFinder) {
      return {
        level: 'error',
        code: 'logo-finder',
        title: 'Logo covers a finder or timing pattern',
        detail:
          'Scanners use these to locate and align the code before error correction runs, so no error correction level can recover this. Make the logo smaller.',
      };
    }
    if (!coverage.recoverable) {
      return {
        level: 'error',
        code: 'logo-too-large',
        title: 'Logo destroys more data than can be recovered',
        detail: `One Reed-Solomon block has ${coverage.worstBlockDamaged} damaged codewords against a budget of ${coverage.worstBlockCapacity}. Shrink the logo or raise error correction.`,
      };
    }
    if (coverage.utilisation > LOGO_BUDGET_WARN) {
      return {
        level: 'warning',
        code: 'logo-tight',
        title: `Logo uses ${Math.round(coverage.utilisation * 100)}% of the error correction budget`,
        detail:
          'It scans now, but there is little headroom left for a scratch, a fold, or a bad print. Keep this under 70%.',
      };
    }
    return null;
  },
};

const densityRule: ValidationRule = {
  id: 'density',
  description: 'Dense symbols need to be printed larger to stay readable.',
  check({ matrix, style, print }) {
    if (matrix.version < 20) return null;
    const span = matrix.size + style.quietZone * 2;
    return {
      level: 'info',
      code: 'high-version',
      title: `Version ${matrix.version} — ${matrix.size} modules across`,
      detail: `Dense codes need to be printed larger. At ${print.recommendedSideMm}mm each module is only ${(print.recommendedSideMm / span).toFixed(2)}mm. Shortening the content lowers the version.`,
    };
  },
};

/**
 * The rules applied by default, in report order.
 *
 * Exported so a caller can filter or extend this list rather than replace the
 * whole validator.
 */
export const BUILTIN_RULES: readonly ValidationRule[] = [
  contrastRule,
  invertedRule,
  quietZoneRule,
  shapeSafetyRule,
  logoRule,
  densityRule,
];

const registered: ValidationRule[] = [];

/**
 * Add a rule that runs alongside the built-ins for every `validate()` call.
 *
 * @example
 * registerValidationRule({
 *   id: 'house-min-ecc',
 *   description: 'Printed codes must be level Q or better.',
 *   check: ({ matrix }) =>
 *     matrix.ecc === 'L' || matrix.ecc === 'M'
 *       ? { level: 'error', code: 'ecc-too-low', title: 'Raise error correction',
 *           detail: 'Company policy requires level Q or H for printed codes.' }
 *       : null,
 * });
 */
export const registerValidationRule = (rule: ValidationRule): void => {
  registered.push(rule);
};

/** Rules registered through {@link registerValidationRule}. */
export const registeredRules = (): readonly ValidationRule[] => registered;

/** Remove a previously registered rule by id. Returns whether one was removed. */
export const unregisterValidationRule = (id: string): boolean => {
  const index = registered.findIndex((r) => r.id === id);
  if (index === -1) return false;
  registered.splice(index, 1);
  return true;
};

/** Compute the geometry a logo rule needs. Exported for reuse by custom rules. */
export const logoCoverage = logoGeometry;

export type { QrStyle };
