import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/app/reset-password/form';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-bold text-white">
            BC
          </div>
          <span className="text-base font-semibold tracking-tight">BranchCheck</span>
        </div>

        <h1 className="text-lg font-semibold tracking-tight">Set a new password</h1>

        {token ? (
          <>
            <p className="mt-1 text-sm text-muted">
              Choose a new password. Any devices currently signed in as you will be signed out.
            </p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <p className="mt-4 rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
            This link is missing its reset token. Request a new one from the sign-in page.
          </p>
        )}

        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/login" className="hover:text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
