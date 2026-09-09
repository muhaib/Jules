import type { Metadata } from 'next';
import Link from 'next/link';

import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth/guard';
import { NOTIFICATION_ICON } from '@/lib/domain/notify';
import { relativeTime } from '@/lib/format';
import { num, str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader } from '@/components/ui/shell';
import { Pagination } from '@/components/ui/pagination';
import { MarkAllRead, MarkRead } from '@/components/notification-actions';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage();
  const params = await searchParams;
  const page = num(params, 'page', 1);
  const unreadOnly = str(params, 'unread') === '1';

  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) };

  const [total, unread, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'You are up to date.'}
        actions={
          <>
            <Link
              href={unreadOnly ? '/notifications' : '/notifications?unread=1'}
              className="btn-secondary"
            >
              {unreadOnly ? 'Show all' : 'Unread only'}
            </Link>
            {unread > 0 && <MarkAllRead />}
          </>
        }
      />

      <Card bodyClassName="">
        {notifications.length === 0 ? (
          <EmptyState
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            description="You will be alerted when a finding is assigned to you, falls due, becomes overdue, or is closed."
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3.5 sm:px-5 ${n.readAt ? '' : 'bg-accent-soft/30'}`}
                >
                  <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                    {NOTIFICATION_ICON[n.level]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {n.link ? (
                        <Link href={n.link} className="hover:text-accent hover:underline">
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                    <p className="mt-1 text-2xs text-faint">{relativeTime(n.createdAt)}</p>
                  </div>
                  {!n.readAt && <MarkRead id={n.id} />}
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              basePath="/notifications"
              params={{ unread: unreadOnly ? '1' : undefined }}
            />
          </>
        )}
      </Card>

      <Card className="mt-4" title="Notification preferences">
        <p className="text-sm text-muted">
          Alerts are generated for: a new finding, an assignment to you, a deadline approaching, an
          overdue finding, evidence submitted for verification, evidence rejected, a finding closed,
          and an escalation. Preferences are stored per user and per notification type, and are
          honoured by the server when alerts are fanned out.
        </p>
      </Card>
    </>
  );
}
