/**
 * Minimal ZIP writer (STORE method — no compression).
 *
 * An .xlsx file is a ZIP container. Rather than pulling in a compression
 * library, this writes uncompressed entries, which every ZIP reader (Excel,
 * LibreOffice, `unzip`, Numbers) accepts. Spreadsheets of BOQ size are small
 * enough that the lack of compression does not matter.
 *
 * Runs unchanged in the browser and in Node — it only uses Uint8Array,
 * DataView and TextEncoder.
 *
 * @module export/zip
 */

const encoder = new TextEncoder();

/** CRC-32 table, built once on first use. */
let crcTable = null;

/** @returns {Uint32Array} */
function getCrcTable() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/**
 * CRC-32 checksum, as used by the ZIP format.
 * @param {Uint8Array} bytes
 * @returns {number} Unsigned 32-bit checksum.
 */
export function crc32(bytes) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * DOS date/time encoding used in ZIP local headers.
 * @param {Date} date
 * @returns {{ time: number, date: number }}
 */
export function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11)
    | ((date.getMinutes() & 0x3f) << 5)
    | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const d = (((date.getFullYear() - 1980) & 0x7f) << 9)
    | (((date.getMonth() + 1) & 0x0f) << 5)
    | (date.getDate() & 0x1f);
  return { time, date: d };
}

/**
 * @typedef {Object} ZipEntry
 * @property {string} name Path inside the archive, forward slashes.
 * @property {string|Uint8Array} data
 */

/**
 * Build a ZIP archive.
 * @param {ZipEntry[]} entries
 * @param {Date} [now=new Date()]
 * @returns {Uint8Array}
 */
export function createZip(entries, now = new Date()) {
  const { time, date } = dosDateTime(now);

  /** @type {{ nameBytes: Uint8Array, dataBytes: Uint8Array, crc: number, offset: number }[]} */
  const records = [];
  /** @type {Uint8Array[]} */
  const chunks = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(dataBytes);

    // Local file header: 30 fixed bytes + file name.
    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true);   // signature
    hv.setUint16(4, 20, true);           // version needed
    hv.setUint16(6, 0, true);            // flags
    hv.setUint16(8, 0, true);            // method 0 = stored
    hv.setUint16(10, time, true);
    hv.setUint16(12, date, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, dataBytes.length, true); // compressed size
    hv.setUint32(22, dataBytes.length, true); // uncompressed size
    hv.setUint16(26, nameBytes.length, true);
    hv.setUint16(28, 0, true);           // extra field length
    header.set(nameBytes, 30);

    records.push({ nameBytes, dataBytes, crc, offset });
    chunks.push(header, dataBytes);
    offset += header.length + dataBytes.length;
  }

  const centralStart = offset;
  for (const rec of records) {
    // Central directory header: 46 fixed bytes + file name.
    const cd = new Uint8Array(46 + rec.nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);   // signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // method
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, rec.crc, true);
    cv.setUint32(20, rec.dataBytes.length, true);
    cv.setUint32(24, rec.dataBytes.length, true);
    cv.setUint16(28, rec.nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra field length
    cv.setUint16(32, 0, true);           // comment length
    cv.setUint16(34, 0, true);           // disk number start
    cv.setUint16(36, 0, true);           // internal attributes
    cv.setUint32(38, 0, true);           // external attributes
    cv.setUint32(42, rec.offset, true);  // local header offset
    cd.set(rec.nameBytes, 46);
    chunks.push(cd);
    offset += cd.length;
  }

  // End of central directory record.
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, records.length, true);
  ev.setUint16(10, records.length, true);
  ev.setUint32(12, offset - centralStart, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);
  chunks.push(eocd);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
