import { route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { branchPerformanceWorkbook } from '@/lib/excel';
import { xlsxResponse } from '@/lib/exports';

export const runtime = 'nodejs';

export const GET = route(async () => {
  const user = await requireApi('export:run');
  const result = await branchPerformanceWorkbook(user);

  const meta = await requestMeta();
  await audit(user, {
    action: 'export.excel',
    entityType: 'Export',
    entityId: 'branch-performance',
    summary: `Exported branch performance (${result.count} rows)`,
    ...meta,
  });

  return xlsxResponse(result.buffer, 'branch-performance');
});
