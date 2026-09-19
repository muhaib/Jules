import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet, currentUser } from '../lib/api';
import { LogoutButton } from '../components/Chrome';
import { nf } from '../lib/format';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { sites } = await apiGet('/api/sites');

  return (
    <>
      <header className="top">
        <div className="inner">
          <span className="brand">AI Crawler Guard</span>
          <span className="spacer" />
          <span className="small muted">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="shell">
        <h1>Your sites</h1>
        <p className="sub">Each site has its own key, its own crawler policy and its own robots.txt.</p>

        {sites.length === 0 ? (
          <div className="card">
            <h2>No sites yet</h2>
            <p className="sub" style={{ marginBottom: 16 }}>
              Add a site to get a key, then drop the middleware into your app. It starts in
              observe-only mode, so nothing is blocked until you decide it should be.
            </p>
            <Link className="btn" href="/sites/new">Add a site</Link>
          </div>
        ) : (
          <>
            <div className="card scroll">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Domain</th>
                    <th className="num">Bot hits, 7 days</th>
                    <th className="num">New inquiries</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id}>
                      <td><Link href={`/sites/${site.id}`}>{site.name}</Link></td>
                      <td className="muted">{site.domain ?? '—'}</td>
                      <td className="num">{nf.format(site.hits_7d)}</td>
                      <td className="num">{site.new_inquiries ? nf.format(site.new_inquiries) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 16 }}><Link className="btn" href="/sites/new">Add a site</Link></p>
          </>
        )}
      </div>
    </>
  );
}
