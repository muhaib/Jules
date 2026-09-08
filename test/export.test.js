import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { crc32, createZip, dosDateTime } from '../src/export/zip.js';
import { createXlsx, escapeXml, columnLetter, sanitizeSheetName } from '../src/export/xlsx.js';
import { toCsv, csvField, toCsvWithBom, BOM } from '../src/export/csv.js';
import { boqRows, workbookSheets, reportHtml } from '../src/export/report.js';
import { calculateProject } from '../src/engine/index.js';
import { createLoadItem } from '../src/engine/load.js';

test('crc32 matches the standard check value', () => {
  // The canonical CRC-32 check value for "123456789" is 0xCBF43926.
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('dosDateTime packs a date into the ZIP fields', () => {
  const { time, date } = dosDateTime(new Date(2024, 4, 17, 13, 45, 30));
  assert.equal((date >> 9) + 1980, 2024);
  assert.equal((date >> 5) & 0x0f, 5);
  assert.equal(date & 0x1f, 17);
  assert.equal(time >> 11, 13);
  assert.equal((time >> 5) & 0x3f, 45);
});

test('createZip produces an archive that the system unzip accepts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'powercalc-'));
  try {
    const path = join(dir, 'a.zip');
    writeFileSync(path, createZip([
      { name: 'one.txt', data: 'hello' },
      { name: 'nested/two.txt', data: 'world' },
    ]));
    const listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });
    assert.match(listing, /one\.txt/);
    assert.match(listing, /nested\/two\.txt/);
    execFileSync('unzip', ['-t', path]); // throws on a corrupt archive
    assert.equal(execFileSync('unzip', ['-p', path, 'nested/two.txt'], { encoding: 'utf8' }), 'world');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('xlsx helpers escape XML and name columns and sheets correctly', () => {
  assert.equal(escapeXml('a & b <c> "d"'), 'a &amp; b &lt;c&gt; &quot;d&quot;');
  assert.equal(columnLetter(0), 'A');
  assert.equal(columnLetter(25), 'Z');
  assert.equal(columnLetter(26), 'AA');
  assert.equal(columnLetter(51), 'AZ');
  assert.equal(sanitizeSheetName('Cable/Volt:Drop'), 'Cable-Volt-Drop');
  assert.equal(sanitizeSheetName('x'.repeat(50)).length, 31);
});

test('createXlsx writes a valid OOXML package with one part per sheet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'powercalc-'));
  try {
    const path = join(dir, 'b.xlsx');
    writeFileSync(path, createXlsx([
      { name: 'BOQ', headers: ['Item', 'Qty'], rows: [['Module <600 W>', 86]] },
      { name: 'Notes', headers: ['#'], rows: [[1]] },
    ]));
    execFileSync('unzip', ['-t', path]);
    const listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });
    for (const part of [
      '\\[Content_Types\\].xml', '_rels/.rels', 'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]) {
      assert.match(listing, new RegExp(part));
    }
    const sheet1 = execFileSync('unzip', ['-p', path, 'xl/worksheets/sheet1.xml'], { encoding: 'utf8' });
    assert.match(sheet1, /Module &lt;600 W&gt;/, 'text cells are XML-escaped');
    assert.match(sheet1, /<v>86<\/v>/, 'numbers are written as numeric cells');
    assert.match(sheet1, /state="frozen"/, 'the header row is frozen');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CSV quoting follows RFC 4180', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('has,comma'), '"has,comma"');
  assert.equal(csvField('has"quote'), '"has""quote"');
  assert.equal(csvField('line\nbreak'), '"line\nbreak"');
  assert.equal(csvField(null), '');
  assert.equal(toCsv([['a', 'b'], [1, 2]]), 'a,b\r\n1,2');
  assert.ok(toCsvWithBom([['a']]).startsWith(BOM));
});

const project = calculateProject({
  load: {
    systemVoltage: 400,
    systemPhases: 3,
    loads: [createLoadItem({
      name: 'Branch load', quantity: 1, ratedPower: 43, unit: 'kW',
      phase: 3, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 10,
    })],
  },
  solar: { cityKey: 'multan' },
  panels: {}, cable: {}, inverter: {}, boq: {},
});

test('BOQ export rows carry the spec columns and a total line when priced', () => {
  const unpriced = boqRows(project.boq.lines, true);
  for (const col of ['Qty', 'Unit', 'Description', 'Brand', 'Remarks']) {
    assert.ok(unpriced.headers.includes(col), `missing column ${col}`);
  }
  assert.equal(unpriced.rows.length, project.boq.lines.length, 'no total row when nothing is priced');

  const priced = boqRows(project.boq.lines.map((l) => ({ ...l, rate: 100 })), true);
  const totalRow = priced.rows.at(-1);
  assert.match(String(totalRow[2]), /TOTAL/);
});

test('the workbook has one sheet per topic and the summary carries real numbers', () => {
  const sheets = workbookSheets({ name: 'UBL Multan Branch', location: 'Multan' }, project);
  assert.deepEqual(sheets.map((s) => s.name),
    ['Summary', 'Load schedule', 'BOQ', 'Cable candidates', 'Assumptions']);
  const flat = sheets[0].rows.flat().join(' ');
  assert.match(flat, /UBL Multan Branch/);
  assert.match(flat, /Maximum demand/);
  assert.match(flat, /Required PV capacity/);
  assert.ok(sheets[0].rows.some((r) => r[0] === 'Demand current' && Number(r[1]) > 68 && Number(r[1]) < 70));
  assert.ok(sheets[4].rows.some((r) => /ampacity check alone/i.test(String(r[1]))));
});

test('the printable report is a complete HTML document carrying the disclaimer', () => {
  const html = reportHtml({ name: 'UBL Multan Branch', location: 'Multan' }, project);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>$/);
  assert.match(html, /UBL Multan Branch/);
  assert.match(html, /Engineering assumptions/);
  assert.match(html, /preliminary engineering estimates/i);
  assert.match(html, /@page/, 'it carries print styles for A4');
  assert.match(html, /Total connected load/);
});

test('report HTML escapes project names rather than injecting them raw', () => {
  const html = reportHtml({ name: '<script>alert(1)</script>' }, project);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});
