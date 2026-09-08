/**
 * Browser download helpers. This is the only module in src/export that touches
 * the DOM — everything else is pure so it can be tested in Node.
 * @module export/download
 */

/**
 * Trigger a file download from in-memory data.
 * @param {string} filename
 * @param {BlobPart} data
 * @param {string} mimeType
 */
export function downloadBlob(filename, data, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has had time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {string} filename
 * @param {string} text
 */
export const downloadCsv = (filename, text) =>
  downloadBlob(filename, text, 'text/csv;charset=utf-8');

/**
 * @param {string} filename
 * @param {Uint8Array} bytes
 */
export const downloadXlsx = (filename, bytes) =>
  downloadBlob(
    filename,
    bytes,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

/**
 * Turn a project name into a safe file name stem.
 * @param {string} name
 * @returns {string}
 */
export const slugify = (name) =>
  String(name || 'project')
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'project';
