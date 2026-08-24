/**
 * `teiqr/validate` — will this code actually scan?
 *
 * Analyses contrast, quiet zone, shape choices, print size, and — the part no
 * other library does — exactly how much of the error correction budget a logo
 * consumes, per Reed-Solomon block rather than as a percentage of the whole
 * symbol.
 */

export {
  contrastRatio,
  fillColors,
  isInverted,
  luminance,
  parseColor,
  type Rgb,
  worstContrast,
} from './validate/contrast.js';
export { type CoverageReport, coverageReport } from './validate/coverage.js';
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
  type ValidateOptions,
  type Validation,
  type ValidationContext,
  type ValidationRule,
  validate,
} from './validate/index.js';
export { type PrintSizeReport, printSize } from './validate/printsize.js';
