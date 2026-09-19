import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet, currentUser } from '../../../lib/api';
import { LogoutButton, SiteTabs } from '../../../components/Chrome';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children, params }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { siteId } = await params;
  const { site } = await apiGet(`/api/sites/${siteId}`);

  return (
    <>
      <header className="top">
        <div className="inner">
          <Link className="brand" href="/">AI Crawler Guard</Link>
          <span className="muted">/</span>
          <span className="brand"><span>{site.name}</span></span>
          <span className="spacer" />
          <span className="small muted">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="shell">
        <SiteTabs siteId={siteId} />
        {children}
      </div>
    </>
  );
}
