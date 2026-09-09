import { route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { findingsWorkbook } from '@/lib/excel';
import { xlsxResponse } from '@/lib/exports';

export const runtime = 'nodejs';

/** GET /api/v1/exports/findings.xlsx — honours the same filters as the findings board. */
export const GET = route(async (req) => {
  const user = await requireApi('export:run');
  const url = new URL(req.url);

  const parseDate = (key: string) => {
    const v = url.searchParams.get(key);
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const result = await findingsWorkbook(user, {
    status: url.searchParams.get('status') ?? undefined,
    severity: url.searchParams.get('severity') ?? undefined,
    branchId: url.searchParams.get('branchId') ?? undefined,
    from: parseDate('from'),
    to: parseDate('to'),
  });

  const meta = await requestMeta();
  await audit(user, {
    action: 'export.excel',
    entityType: 'Export',
    entityId: 'findings',
    summary: `Exported findings (${result.count} rows)`,
    ...meta,
  });

  return xlsxResponse(result.buffer, 'findings');
});
