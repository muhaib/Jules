import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader, Card } from '@/components/ui/shell';

export const metadata: Metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <>
      <PageHeader
        title="You are offline"
        description="This page needs a connection, but your inspection work is safe."
      />
      <Card>
        <p className="text-sm leading-relaxed text-ink">
          Anything you recorded during an inspection — answers, observations and photos — is stored
          on this device and will upload automatically as soon as you have signal. Nothing is lost.
        </p>
        <p className="mt-3 text-sm text-muted">
          If you had an inspection open, reopen it from your assignments and keep going.
        </p>
        <div className="mt-4">
          <Link href="/inspections?mine=1" className="btn-primary">
            My inspections
          </Link>
        </div>
      </Card>
    </>
  );
}
