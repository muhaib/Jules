/** Small hand-rolled validation helpers - enough for this surface, no schema library. */
export class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code, details) {
  return new HttpError(400, code, details);
}

export function str(value, { max = 500, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const out = trim ? value.trim() : value;
  if (!out) return null;
  return out.slice(0, max);
}

export function requireStr(body, field, { max = 500, min = 1 } = {}) {
  const value = str(body?.[field], { max });
  if (!value || value.length < min) {
    throw badRequest('invalid_field', { field, reason: `must be a string of at least ${min} characters` });
  }
  return value;
}

export function requireEmail(body, field = 'email') {
  const value = requireStr(body, field, { max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw badRequest('invalid_field', { field, reason: 'must be an email address' });
  }
  return value.toLowerCase();
}

export function parseDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function clampInt(value, { min, max, fallback }) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
