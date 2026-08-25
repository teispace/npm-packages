/**
 * Will this code actually scan?
 *
 * Runs a list of independent {@link ValidationRule}s over a styled symbol and
 * returns everything they found. The rules are data, not control flow, so a
 * consumer can disable one, add their own, or replace the set entirely — see
 * {@link registerValidationRule} and the `rules` option below.
 */

import { requireFiniteOptions } from '../core/numbers.js';
import type { QrMatrix } from '../core/types.js';
import { logoGeometry } from '../render/logo.js';
import { DEFAULT_STYLE, type QrStyle } from '../render/types.js';
import { isInverted, worstContrast } from './contrast.js';
import { type CoverageReport, coverageReport } from './coverage.js';
import { type PrintSizeReport, printSize } from './printsize.js';
import {
  BUILTIN_RULES,
  type Issue,
  type IssueLevel,
  registeredRules,
  type ValidationContext,
  type ValidationRule,
} from './rules.js';

export interface Validation {
  /** 0-100. An at-a-glance summary only; read the issues for what to change. */
  readonly score: number;
  readonly issues: Issue[];
  readonly contrast: number | null;
  readonly inverted: boolean;
  readonly coverage: CoverageReport | null;
  readonly print: PrintSizeReport;
}

export interface ValidateOptions {
  /** Distance the code will be scanned from, in millimetres. */
  scanDistanceMm?: number;
  dpi?: number;
  /**
   * Replace the rule set entirely. Defaults to the built-ins plus anything
   * registered globally. Pass `[...BUILTIN_RULES, myRule]` to extend instead.
   */
  rules?: readonly ValidationRule[];
  /** Skip specific rules by id, keeping the rest of the default set. */
  disableRules?: readonly string[];
  /**
   * Points deducted per issue level. Lets a caller weight the score to their
   * own risk tolerance without reimplementing the report.
   */
  penalties?: Partial<Record<IssueLevel, number>>;
}

/** Default deductions from a starting score of 100. */
const DEFAULT_PENALTIES: Record<IssueLevel, number> = { error: 45, warning: 15, info: 0 };

export const validate = (
  matrix: QrMatrix,
  style: Partial<QrStyle> = {},
  options: ValidateOptions = {},
): Validation => {
  requireFiniteOptions(
    options as unknown as Record<string, unknown>,
    ['scanDistanceMm', 'dpi'],
    'options',
  );
  const { scanDistanceMm = 300, dpi = 300 } = options;
  // Fill in defaults so rules can rely on every field being present.
  const resolved: QrStyle = { ...DEFAULT_STYLE, ...style };

  const contrast = worstContrast(resolved.body, resolved.background);
  const inverted = isInverted(resolved.body, resolved.background);

  const coverage: CoverageReport | null = resolved.logo
    ? coverageReport(matrix, logoGeometry(matrix, resolved.logo).covered)
    : null;

  const span = matrix.size + resolved.quietZone * 2;
  const print = printSize(span, scanDistanceMm, dpi);

  const context: ValidationContext = {
    matrix,
    style: resolved,
    contrast,
    inverted,
    coverage,
    print,
    scanDistanceMm,
    dpi,
  };

  const disabled = new Set(options.disableRules ?? []);
  const active = (options.rules ?? [...BUILTIN_RULES, ...registeredRules()]).filter(
    (rule) => !disabled.has(rule.id),
  );

  const issues: Issue[] = [];
  for (const rule of active) {
    const found = rule.check(context);
    if (!found) continue;
    if (Array.isArray(found)) issues.push(...found);
    else issues.push(found);
  }

  const penalties = { ...DEFAULT_PENALTIES, ...options.penalties };
  const score = Math.max(
    0,
    issues.reduce((total, issue) => total - (penalties[issue.level] ?? 0), 100),
  );

  return { score, issues, contrast, inverted, coverage, print };
};

export {
  contrastRatio,
  fillColors,
  isInverted,
  luminance,
  parseColor,
  type Rgb,
  worstContrast,
} from './contrast.js';
export { type CoverageReport, coverageReport } from './coverage.js';
export { type PrintSizeReport, printSize } from './printsize.js';
export {
  BUILTIN_RULES,
  COMFORTABLE_CONTRAST,
  type Issue,
  type IssueLevel,
  LOGO_BUDGET_WARN,
  MIN_CONTRAST,
  registeredRules,
  registerValidationRule,
  unregisterValidationRule,
  type ValidationContext,
  type ValidationRule,
} from './rules.js';
