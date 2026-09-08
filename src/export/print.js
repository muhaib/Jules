/**
 * PDF export.
 *
 * The report is rendered into a hidden iframe and handed to the browser's own
 * print pipeline, where "Save as PDF" produces the file. This is deliberate:
 * it keeps the app dependency-free and offline-capable, and the browser's
 * renderer produces better typography and pagination than a hand-rolled PDF
 * writer would. The trade-off is that the user completes the save in the print
 * dialog rather than getting a file straight away.
 *
 * @module export/print
 */

/**
 * Open the browser print dialog for a standalone HTML document.
 * @param {string} html A complete HTML document.
 * @param {string} [title] Used as the suggested PDF file name by most browsers.
 */
export function printHtml(html, title) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  if (title) doc.title = title;

  const run = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      // Keep the frame alive briefly; removing it immediately cancels the
      // dialog in some browsers.
      setTimeout(() => frame.remove(), 60000);
    }
  };

  if (doc.readyState === 'complete') run();
  else frame.onload = run;
}
