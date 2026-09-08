import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { navFor } from '@/lib/nav';
import { AppShell } from '@/components/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const unread = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  return (
    <AppShell user={user} nav={navFor(user.role)} unreadCount={unread}>
      {children}
    </AppShell>
  );
}
