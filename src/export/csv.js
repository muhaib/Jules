/**
 * CSV serialisation with RFC 4180 quoting.
 * @module export/csv
 */

/** UTF-8 byte order mark, so Excel on Windows reads non-ASCII correctly. */
export const BOM = String.fromCharCode(0xfeff);

/**
 * Quote a single field if it contains a delimiter, quote or newline.
 * @param {unknown} value
 * @returns {string}
 */
export function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {Array<Array<unknown>>} rows
 * @returns {string}
 */
export const toCsv = (rows) => rows.map((r) => r.map(csvField).join(',')).join('\r\n');

/**
 * @param {Array<Array<unknown>>} rows
 * @returns {string}
 */
export const toCsvWithBom = (rows) => BOM + toCsv(rows);
