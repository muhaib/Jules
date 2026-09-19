import { apiGet } from '../../../../lib/api';
import { PolicyEditor } from '../../../../components/PolicyEditor';

export const dynamic = 'force-dynamic';

export default async function BotsPage({ params }) {
  const { siteId } = await params;
  const [{ crawlers, version }, { policy }] = await Promise.all([
    apiGet('/api/crawlers'),
    apiGet(`/api/sites/${siteId}/policy`),
  ]);

  return (
    <>
      <h1>Crawlers</h1>
      <p className="sub">
        Decide what each crawler gets. Saving updates both the enforcement rules your
        middleware polls and the robots.txt it serves, so the two cannot drift apart.
      </p>
      <PolicyEditor siteId={siteId} crawlers={crawlers} policy={policy} catalogVersion={version} />
    </>
  );
}
