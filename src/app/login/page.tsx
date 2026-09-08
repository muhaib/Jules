import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from '@/app/login/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');
  const params = await searchParams;

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Product framing — kept plain: no gradients, no illustration. */}
      <section className="hidden bg-accent px-12 py-16 text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-white/15 text-sm font-bold">
              BC
            </div>
            <span className="text-base font-semibold tracking-tight">BranchCheck</span>
          </div>
          <h1 className="mt-16 max-w-md text-3xl font-semibold leading-snug tracking-tight">
            Inspection is the easy part. Proving it was fixed is the product.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/80">
            Every finding carries a severity, an owner, a deadline and verified evidence. Nothing
            closes on someone&rsquo;s word.
          </p>
        </div>

        <dl className="grid max-w-md grid-cols-2 gap-x-8 gap-y-6 text-sm">
          {[
            ['Assign', 'Inspections scheduled to branches and inspectors.'],
            ['Record', 'Checklist answers with photo evidence, offline capable.'],
            ['Remediate', 'Findings routed to a responsible person with a deadline.'],
            ['Verify', 'A verifier accepts or rejects the proof before closure.'],
          ].map(([term, def]) => (
            <div key={term}>
              <dt className="font-medium text-white">{term}</dt>
              <dd className="mt-1 text-white/70">{def}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-bold text-white">
              BC
            </div>
            <span className="text-base font-semibold tracking-tight">BranchCheck</span>
          </div>

          <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use your organization account.</p>

          {params.reset === '1' && (
            <p className="mt-4 rounded-md border border-ok/25 bg-ok/10 px-3 py-2 text-sm text-ok">
              Password updated. Sign in with your new password.
            </p>
          )}

          <LoginForm nextPath={params.next} />

          <p className="mt-4 text-center text-xs text-muted">
            <Link href="/forgot-password" className="hover:text-accent hover:underline">
              Forgot your password?
            </Link>
          </p>

          <div className="mt-8 rounded-md border border-line bg-raised px-3.5 py-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-faint">
              Demo accounts
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Password for all demo users: <code className="font-mono text-ink">BranchCheck#2026</code>
            </p>
            <ul className="mt-2 space-y-1 font-mono text-2xs text-muted">
              <li>admin@abcbank.example — Super Admin</li>
              <li>kamran.rashid@abcbank.example — Regional Manager</li>
              <li>usman.tariq@abcbank.example — Inspector</li>
              <li>tahir.mehmood@abcbank.example — Branch Manager</li>
              <li>imran.qureshi@abcbank.example — Verifier</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
