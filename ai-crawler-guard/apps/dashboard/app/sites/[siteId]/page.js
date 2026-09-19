import Link from 'next/link';
import { apiGet } from '../../../lib/api';
import { TimelineChart } from '../../../components/TimelineChart';
import { CrawlerBars } from '../../../components/CrawlerBars';
import { VerificationBar } from '../../../components/VerificationBar';
import { RangePicker } from '../../../components/RangePicker';
import { compact, nf, PURPOSE_LABELS, relativeTime } from '../../../lib/format';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

/** Fill in the days with no traffic so the timeline does not lie about gaps. */
function toDailySeries(timeline, from, to) {
  const buckets = new Map();
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    buckets.set(key, { day: key, served: 0, licensed: 0, blocked: 0 });
  }
  for (const row of timeline) {
    const key = row.day.slice(0, 10);
    const bucket = buckets.get(key) ?? { day: key, served: 0, licensed: 0, blocked: 0 };
    if (row.action === 'block') bucket.blocked += row.hits;
    else if (row.action === 'license') bucket.licensed += row.hits;
    else bucket.served += row.hits;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export default async function OverviewPage({ params, searchParams }) {
  const { siteId } = await params;
  const search = await searchParams;
  const days = Number(search?.days ?? 30);
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY);

  const data = await apiGet(
    `/api/sites/${siteId}/overview?from=${from.toISOString()}&to=${to.toISOString()}`,
  );
  const { totals, byCrawler, byPage, byVerification, recentInquiries } = data;
  const series = toDailySeries(data.timeline, data.range.from, data.range.to);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Overview</h1>
          <p className="sub">AI crawler traffic over the last {days} days.</p>
        </div>
        <span className="spacer" style={{ flex: 1 }} />
        <RangePicker current={days} />
      </div>

      <div className="tiles" style={{ marginBottom: 16 }}>
        <Tile label="Bot hits" value={compact(totals.hits)} foot={`${nf.format(totals.crawlers)} crawlers`} />
        <Tile label="Served" value={compact(totals.served)} foot="content delivered" />
        <Tile label="Sent to licensing" value={compact(totals.licensed)} foot="landing page shown" />
        <Tile label="Blocked" value={compact(totals.blocked)} foot="403, no content" />
        <Tile label="Spoofed" value={compact(totals.spoofed)} foot="failed the identity check" />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Daily traffic by outcome</h2>
            <p className="sub small" style={{ margin: 0 }}>What the middleware did with each hit.</p>
          </div>
        </div>
        <TimelineChart days={series} />
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>By crawler</h2>
              <p className="sub small" style={{ margin: 0 }}>Hits per crawler in this range.</p>
            </div>
          </div>
          <CrawlerBars rows={byCrawler.slice(0, 12)} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Identity checks</h2>
              <p className="sub small" style={{ margin: 0 }}>
                Reverse DNS and published IP ranges, per hit.
              </p>
            </div>
          </div>
          <VerificationBar counts={byVerification} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>Crawler detail</h2>
            <p className="sub small" style={{ margin: 0 }}>
              The same numbers as the chart above, in full.
            </p>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <Link className="small" href={`/sites/${siteId}/bots`}>Change what each one gets &rarr;</Link>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Crawler</th>
                <th>Operator</th>
                <th>Purpose</th>
                <th className="num">Hits</th>
                <th className="num">Pages</th>
                <th className="num">Blocked</th>
                <th className="num">Licensing</th>
                <th className="num">Verified</th>
                <th className="num">Spoofed</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {byCrawler.length === 0 && (
                <tr><td colSpan={10} className="muted">No AI crawler traffic recorded yet.</td></tr>
              )}
              {byCrawler.map((row) => (
                <tr key={row.bot_id}>
                  <td>{row.bot_name ?? row.bot_id}</td>
                  <td className="muted">{row.operator ?? '—'}</td>
                  <td className="muted">{PURPOSE_LABELS[row.purpose] ?? row.purpose ?? '—'}</td>
                  <td className="num">{nf.format(row.hits)}</td>
                  <td className="num">{nf.format(row.pages)}</td>
                  <td className="num">{nf.format(row.blocked)}</td>
                  <td className="num">{nf.format(row.licensed)}</td>
                  <td className="num">{nf.format(row.verified)}</td>
                  <td className="num">{row.spoofed ? nf.format(row.spoofed) : '—'}</td>
                  <td className="muted small">{relativeTime(row.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2>Most-crawled pages</h2>
            <p className="sub small" style={{ margin: 0 }}>Where the crawlers are actually going.</p>
          </div>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th className="num">Hits</th>
                <th className="num">Crawlers</th>
                <th className="num">Blocked</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {byPage.length === 0 && (
                <tr><td colSpan={5} className="muted">Nothing recorded yet.</td></tr>
              )}
              {byPage.slice(0, 25).map((row) => (
                <tr key={row.path}>
                  <td className="path">{row.path}</td>
                  <td className="num">{nf.format(row.hits)}</td>
                  <td className="num">{nf.format(row.crawlers)}</td>
                  <td className="num">{row.blocked ? nf.format(row.blocked) : '—'}</td>
                  <td className="muted small">{relativeTime(row.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {recentInquiries.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div><h2>Recent licensing inquiries</h2></div>
            <span className="spacer" style={{ flex: 1 }} />
            <Link className="small" href={`/sites/${siteId}/inquiries`}>All inquiries &rarr;</Link>
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr><th>From</th><th>Organisation</th><th>Use</th><th>Status</th><th>Received</th></tr>
              </thead>
              <tbody>
                {recentInquiries.map((inquiry) => (
                  <tr key={inquiry.id}>
                    <td>{inquiry.name} <span className="muted small">{inquiry.email}</span></td>
                    <td className="muted">{inquiry.organization ?? '—'}</td>
                    <td className="muted">{inquiry.intended_use ?? '—'}</td>
                    <td><span className="pill">{inquiry.status}</span></td>
                    <td className="muted small">{relativeTime(inquiry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, foot }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="foot">{foot}</div>
    </div>
  );
}
