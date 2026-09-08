/**
 * Input validation for every calculator.
 * Validators never throw — they return a list of issues so the UI can render
 * messages next to the offending field and still show partial results.
 * @module engine/validation
 */

/**
 * @typedef {Object} Issue
 * @property {string} field   Machine-readable field key.
 * @property {'error'|'warning'} level
 * @property {string} message Human-readable message.
 */

/**
 * @param {string} field
 * @param {string} message
 * @returns {Issue}
 */
export const error = (field, message) => ({ field, level: 'error', message });

/**
 * @param {string} field
 * @param {string} message
 * @returns {Issue}
 */
export const warn = (field, message) => ({ field, level: 'warning', message });

/** @param {Issue[]} issues @returns {boolean} */
export const hasErrors = (issues) => issues.some((i) => i.level === 'error');

/** @param {Issue[]} issues @returns {Issue[]} */
export const errorsOnly = (issues) => issues.filter((i) => i.level === 'error');

/**
 * Coerce anything to a finite number, or NaN.
 * @param {unknown} v
 * @returns {number}
 */
export function num(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Generic numeric field check.
 * @param {Issue[]} issues Collected into this array.
 * @param {string} field
 * @param {unknown} value
 * @param {{ label: string, min?: number, max?: number, exclusiveMin?: number, integer?: boolean, required?: boolean }} opts
 * @returns {number} The coerced value (NaN when invalid).
 */
export function checkNumber(issues, field, value, opts) {
  const { label, min, max, exclusiveMin, integer, required = true } = opts;
  const n = num(value);
  if (Number.isNaN(n)) {
    if (required) issues.push(error(field, `${label} is required and must be a number.`));
    return NaN;
  }
  if (integer && !Number.isInteger(n)) {
    issues.push(error(field, `${label} must be a whole number.`));
    return NaN;
  }
  if (exclusiveMin !== undefined && n <= exclusiveMin) {
    issues.push(error(field, `${label} must be greater than ${exclusiveMin}.`));
    return NaN;
  }
  if (min !== undefined && n < min) {
    issues.push(error(field, `${label} cannot be less than ${min}.`));
    return NaN;
  }
  if (max !== undefined && n > max) {
    issues.push(error(field, `${label} cannot be greater than ${max}.`));
    return NaN;
  }
  return n;
}

/**
 * Power factor must sit in (0, 1]. A PF above 1 is physically impossible.
 * @param {Issue[]} issues
 * @param {string} field
 * @param {unknown} value
 * @param {string} [label='Power factor']
 * @returns {number}
 */
export function checkPowerFactor(issues, field, value, label = 'Power factor') {
  const n = num(value);
  if (Number.isNaN(n)) {
    issues.push(error(field, `${label} is required.`));
    return NaN;
  }
  if (n > 1) {
    issues.push(error(field, `${label} cannot exceed 1.0 — a power factor above unity is not physically possible.`));
    return NaN;
  }
  if (n <= 0) {
    issues.push(error(field, `${label} must be greater than 0.`));
    return NaN;
  }
  if (n < 0.5) {
    issues.push(warn(field, `${label} of ${n} is unusually low. Check the value, or confirm PF correction is required.`));
  }
  return n;
}

/**
 * System voltage: must be positive and non-zero.
 * @param {Issue[]} issues
 * @param {string} field
 * @param {unknown} value
 * @returns {number}
 */
export function checkVoltage(issues, field, value) {
  const n = num(value);
  if (Number.isNaN(n)) {
    issues.push(error(field, 'System voltage is required.'));
    return NaN;
  }
  if (n <= 0) {
    issues.push(error(field, 'System voltage must be greater than 0 V — current cannot be calculated at zero volts.'));
    return NaN;
  }
  if (n > 1000) {
    issues.push(warn(field, 'Voltages above 1000 V are outside the low-voltage scope of this tool.'));
  }
  return n;
}

/**
 * Diversity / demand factor in (0, 1]. Values above 1 are rejected because a
 * diversified demand larger than the connected load is not meaningful here.
 * @param {Issue[]} issues
 * @param {string} field
 * @param {unknown} value
 * @param {string} [label='Diversity factor']
 * @returns {number}
 */
export function checkFactor(issues, field, value, label = 'Diversity factor') {
  const n = num(value);
  if (Number.isNaN(n)) {
    issues.push(error(field, `${label} is required.`));
    return NaN;
  }
  if (n <= 0) {
    issues.push(error(field, `${label} must be greater than 0.`));
    return NaN;
  }
  if (n > 1) {
    issues.push(error(field, `${label} cannot exceed 1.0.`));
    return NaN;
  }
  return n;
}
