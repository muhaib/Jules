import { apiGet } from '../../../../lib/api';
import { CopyButton } from '../../../../components/Chrome';

export const dynamic = 'force-dynamic';

export default async function RobotsPage({ params }) {
  const { siteId } = await params;
  const [text, { site }] = await Promise.all([
    apiGet(`/api/sites/${siteId}/robots.txt`),
    apiGet(`/api/sites/${siteId}`),
  ]);

  return (
    <>
      <h1>robots.txt</h1>
      <p className="sub">
        Generated from the policy on the Crawlers tab, so the file and the enforcement
        always say the same thing.
      </p>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Generated file</h2>
            <p className="sub small" style={{ margin: 0 }}>
              Everything between the BEGIN and END markers is replaced each time it is
              generated. Your own rules outside those markers are preserved.
            </p>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <CopyButton text={text} label="Copy" />
        </div>
        <pre className="code">{text}</pre>
      </div>

      <div className="card">
        <h2>Two ways to use it</h2>
        <p className="sub small">Pick one. The first keeps itself up to date; the second is a file you paste.</p>
        <ol className="small" style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>
          <li style={{ marginBottom: 10 }}>
            <strong>Let the middleware serve it.</strong> Set <code>robots: {'{'} serve: true {'}'}</code> and
            the middleware answers <code>/robots.txt</code> itself, regenerating from the live
            policy on every request. Pass your existing file as <code>robots.existing</code> and
            your own rules are merged in.
          </li>
          <li>
            <strong>Paste it.</strong> Copy the block above into the <code>robots.txt</code> you already
            serve. You will need to re-paste it whenever you change the policy.
          </li>
        </ol>
      </div>

      <div className="card">
        <h2>What robots.txt can and cannot do</h2>
        <p className="small" style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
          It is a request, not a control. Well-behaved crawlers honour it; several
          documented AI crawlers do not. The middleware enforces the same policy in your
          application, which is the part that actually holds.
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          Two tokens in the list &mdash; Google-Extended and Applebot-Extended &mdash; are opt-outs that
          only exist in robots.txt. They never appear in a User-Agent header, so they can be
          set here and nowhere else.
          {site.domain
            ? ` Licensing links point at https://${site.domain.replace(/^https?:\/\//, '')}.`
            : ' Add a domain to this site to get licensing links in the generated file.'}
        </p>
      </div>
    </>
  );
}
