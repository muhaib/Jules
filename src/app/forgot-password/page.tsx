import type { Metadata } from 'next';
import Link from 'next/link';

import { ForgotPasswordForm } from '@/app/forgot-password/form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-bold text-white">
            BC
          </div>
          <span className="text-base font-semibold tracking-tight">BranchCheck</span>
        </div>

        <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your email and we will send you a link to set a new password.
        </p>

        <ForgotPasswordForm />

        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/login" className="hover:text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
