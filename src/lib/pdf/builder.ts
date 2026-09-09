import 'server-only';

import type PDFDocument from 'pdfkit';

import { CONTENT_WIDTH, PAGE, PDF } from '@/lib/pdf/theme';

export type Doc = InstanceType<typeof PDFDocument>;

/**
 * Small layout helpers over pdfkit. Keeping them in one place is what stops the
 * report code from becoming a wall of coordinate arithmetic.
 */
export class Layout {
  constructor(readonly doc: Doc) {}

  get x() {
    return PAGE.margin;
  }

  get bottom() {
    return PAGE.height - PAGE.margin - 28; // leave room for the footer
  }

  /** Starts a new page when `needed` points will not fit below the cursor. */
  ensure(needed: number) {
    if (this.doc.y + needed > this.bottom) {
      this.doc.addPage();
      return true;
    }
    return false;
  }

  gap(points: number) {
    this.doc.y += points;
  }

  sectionTitle(text: string) {
    this.ensure(40);
    this.doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(PDF.ink)
      .text(text.toUpperCase(), this.x, this.doc.y, { characterSpacing: 0.6 });
    const y = this.doc.y + 4;
    this.doc
      .moveTo(this.x, y)
      .lineTo(this.x + CONTENT_WIDTH, y)
      .lineWidth(1)
      .strokeColor(PDF.accent)
      .stroke();
    this.doc.y = y + 10;
  }

  label(text: string) {
    this.doc.font('Helvetica').fontSize(7.5).fillColor(PDF.faint).text(text.toUpperCase(), {
      characterSpacing: 0.5,
    });
  }

  body(text: string, options: { size?: number; color?: string; bold?: boolean; width?: number } = {}) {
    this.doc
      .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(options.size ?? 9.5)
      .fillColor(options.color ?? PDF.ink)
      .text(text, { width: options.width ?? CONTENT_WIDTH, lineGap: 1.5 });
  }

  /** Key/value grid used on the cover and summary blocks. */
  keyValues(rows: [string, string][], columns = 2) {
    const colWidth = CONTENT_WIDTH / columns;
    const rowHeight = 30;
    let startY = this.doc.y;

    rows.forEach(([key, value], i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);

      if (col === 0 && row > 0 && this.doc.y + rowHeight > this.bottom) {
        this.doc.addPage();
        startY = this.doc.y;
      }

      const x = this.x + col * colWidth;
      const y = startY + row * rowHeight;

      this.doc.font('Helvetica').fontSize(7.5).fillColor(PDF.faint)
        .text(key.toUpperCase(), x, y, { width: colWidth - 12, characterSpacing: 0.4 });
      this.doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF.ink)
        .text(value, x, y + 11, { width: colWidth - 12, ellipsis: true, height: 14 });
    });

    this.doc.y = startY + Math.ceil(rows.length / columns) * rowHeight;
    this.doc.x = this.x;
  }

  /** A bordered table with a header row; returns once the last row is drawn. */
  table(
    columns: { header: string; width: number; align?: 'left' | 'right' }[],
    rows: { cells: string[]; colors?: (string | undefined)[]; bold?: boolean }[],
  ) {
    const headerHeight = 20;
    const drawHeader = () => {
      const y = this.doc.y;
      this.doc.rect(this.x, y, CONTENT_WIDTH, headerHeight).fill(PDF.raised);
      let cx = this.x;
      columns.forEach((c) => {
        this.doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PDF.muted).text(
          c.header.toUpperCase(),
          cx + 6,
          y + 6.5,
          { width: c.width - 12, align: c.align ?? 'left', characterSpacing: 0.4 },
        );
        cx += c.width;
      });
      this.doc.y = y + headerHeight;
    };

    this.ensure(headerHeight + 40);
    drawHeader();

    for (const row of rows) {
      // Measure the tallest cell so wrapped text never overlaps the next row.
      let height = 16;
      columns.forEach((c, i) => {
        const h =
          this.doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).heightOfString(
            row.cells[i] ?? '',
            { width: c.width - 12 },
          ) + 9;
        if (h > height) height = h;
      });

      if (this.doc.y + height > this.bottom) {
        this.doc.addPage();
        drawHeader();
      }

      const y = this.doc.y;
      let cx = this.x;
      columns.forEach((c, i) => {
        this.doc
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .fillColor(row.colors?.[i] ?? PDF.ink)
          .text(row.cells[i] ?? '', cx + 6, y + 4.5, {
            width: c.width - 12,
            align: c.align ?? 'left',
          });
        cx += c.width;
      });

      this.doc
        .moveTo(this.x, y + height)
        .lineTo(this.x + CONTENT_WIDTH, y + height)
        .lineWidth(0.5)
        .strokeColor(PDF.line)
        .stroke();
      this.doc.y = y + height;
    }

    this.doc.x = this.x;
    this.gap(6);
  }

  /** A coloured pill, e.g. a severity or status badge. */
  pill(text: string, color: string, x: number, y: number) {
    const textWidth = this.doc.font('Helvetica-Bold').fontSize(7.5).widthOfString(text);
    const width = textWidth + 14;
    this.doc.roundedRect(x, y, width, 14, 3).fillAndStroke(color, color);
    // lineBreak:false — a long label such as "UNDER VERIFICATION" must never wrap
    // inside a fixed-height pill, which would clip the second line.
    this.doc
      .fillColor(PDF.white)
      .text(text, x + 7, y + 4, { width: textWidth + 1, lineBreak: false });
    return width;
  }

  /** Callout box used for recommendations and warnings. */
  callout(title: string, body: string, color: string, background: string) {
    const padding = 10;
    const textWidth = CONTENT_WIDTH - padding * 2 - 4;
    const titleHeight = this.doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(title, { width: textWidth });
    const bodyHeight = this.doc.font('Helvetica').fontSize(9).heightOfString(body, { width: textWidth, lineGap: 1.5 });
    const height = titleHeight + bodyHeight + padding * 2 + 4;

    this.ensure(height + 10);
    const y = this.doc.y;

    this.doc.rect(this.x, y, CONTENT_WIDTH, height).fill(background);
    this.doc.rect(this.x, y, 3, height).fill(color);

    this.doc.font('Helvetica-Bold').fontSize(9.5).fillColor(color)
      .text(title, this.x + padding + 4, y + padding, { width: textWidth });
    this.doc.font('Helvetica').fontSize(9).fillColor(PDF.ink)
      .text(body, this.x + padding + 4, y + padding + titleHeight + 3, { width: textWidth, lineGap: 1.5 });

    this.doc.y = y + height;
    this.doc.x = this.x;
    this.gap(10);
  }
}

/** Page footer with pagination and a confidentiality line. */
export function paginate(doc: Doc, organizationName: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = PAGE.height - PAGE.margin + 6;
    doc
      .moveTo(PAGE.margin, y - 8)
      .lineTo(PAGE.width - PAGE.margin, y - 8)
      .lineWidth(0.5)
      .strokeColor(PDF.line)
      .stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(PDF.faint);
    doc.text(`${organizationName} · Confidential`, PAGE.margin, y, {
      width: CONTENT_WIDTH / 2,
      lineBreak: false,
    });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE.margin + CONTENT_WIDTH / 2, y, {
      width: CONTENT_WIDTH / 2,
      align: 'right',
      lineBreak: false,
    });
  }
}

/** Collects the pdfkit stream into a single buffer. */
export function finish(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
