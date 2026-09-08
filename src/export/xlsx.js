/**
 * Writes a genuine .xlsx workbook (SpreadsheetML in an OOXML ZIP container)
 * with no third-party library.
 *
 * Scope: multiple sheets, a bold frozen header row, inline strings, numbers and
 * column widths. That covers a BOQ and a calculation report; it is not a
 * general-purpose Excel library.
 *
 * @module export/xlsx
 */

import { createZip } from './zip.js';

/**
 * @typedef {Object} SheetSpec
 * @property {string} name              Sheet tab name (Excel allows 31 chars).
 * @property {string[]} [headers]       Rendered bold and frozen.
 * @property {Array<Array<string|number|null|undefined>>} rows
 * @property {number[]} [columnWidths]  In Excel character units.
 */

/**
 * Drop the control characters that Excel rejects, keeping tab, LF and CR.
 * Written as a code-point scan rather than a regex so the source file itself
 * stays free of control characters.
 * @param {string} s
 * @returns {string}
 */
function stripControlChars(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;
    if (c === 0x7f) continue;
    out += ch;
  }
  return out;
}

/**
 * XML-escape a value for use in element content or an attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeXml(value) {
  return stripControlChars(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Zero-based column index -> spreadsheet column letters (0 -> A, 26 -> AA).
 * @param {number} index
 * @returns {string}
 */
export function columnLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Excel sheet names cannot contain : \ / ? * [ ] and are capped at 31 chars.
 * @param {string} name
 * @returns {string}
 */
export const sanitizeSheetName = (name) =>
  (String(name || 'Sheet').replace(/[:\\/?*[\]]/g, '-').slice(0, 31)) || 'Sheet';

/**
 * @param {Array<string|number|null|undefined>} cells
 * @param {number} rowNumber
 * @param {number} styleId
 * @returns {string}
 */
function rowXml(cells, rowNumber, styleId) {
  const parts = cells.map((value, i) => {
    const ref = `${columnLetter(i)}${rowNumber}`;
    const style = styleId ? ` s="${styleId}"` : '';
    if (value === null || value === undefined || value === '') {
      return `<c r="${ref}"${style}/>`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${ref}"${style}><v>${value}</v></c>`;
    }
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  });
  return `<row r="${rowNumber}">${parts.join('')}</row>`;
}

/**
 * @param {SheetSpec} sheet
 * @returns {string} Worksheet XML.
 */
function sheetXml(sheet) {
  const headers = sheet.headers ?? [];
  const bodyRows = sheet.rows ?? [];
  const colCount = Math.max(headers.length, ...bodyRows.map((r) => r.length), 1);

  const widths = sheet.columnWidths ?? [];
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  /** @type {string[]} */
  const rows = [];
  let n = 1;
  if (headers.length) {
    rows.push(rowXml(headers, n, 1)); // style 1 = bold
    n += 1;
  }
  for (const r of bodyRows) {
    rows.push(rowXml(r, n, 0));
    n += 1;
  }

  const lastRef = `${columnLetter(colCount - 1)}${Math.max(1, n - 1)}`;
  const freeze = headers.length
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<dimension ref="A1:${lastRef}"/>${cols}<sheetData>${rows.join('')}</sheetData></worksheet>`;
}

/**
 * Build an .xlsx workbook.
 * @param {SheetSpec[]} sheets
 * @returns {Uint8Array} The complete .xlsx file.
 */
export function createXlsx(sheets) {
  const list = (sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }])
    .map((s, i) => ({ ...s, name: sanitizeSheetName(s.name || `Sheet${i + 1}`) }));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${list.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Two cell formats: 0 = default, 1 = bold (used for header rows).
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`;

  return createZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: styles },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ]);
}
