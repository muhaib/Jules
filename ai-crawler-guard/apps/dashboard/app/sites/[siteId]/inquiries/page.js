import { apiGet } from '../../../../lib/api';
import { InquiryList } from '../../../../components/InquiryList';

export const dynamic = 'force-dynamic';

export default async function InquiriesPage({ params }) {
  const { siteId } = await params;
  const { inquiries } = await apiGet(`/api/sites/${siteId}/inquiries`);

  return (
    <>
      <h1>Licensing inquiries</h1>
      <p className="sub">
        Sent by whoever filled in the landing page a blocked or licensed crawler was
        shown. Nothing here is a transaction &mdash; these are leads, and the next step is you
        replying by email.
      </p>
      <InquiryList siteId={siteId} initial={inquiries} />
    </>
  );
}
