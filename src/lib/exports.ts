import 'server-only';

/** Shared response shape for every spreadsheet download. */
export function xlsxResponse(buffer: Buffer, name: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-length': String(buffer.byteLength),
      'content-disposition': `attachment; filename="branchcheck-${name}-${stamp}.xlsx"`,
      'cache-control': 'private, no-store',
    },
  });
}
