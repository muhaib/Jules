'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const BRANCH_TYPES = [
  'Full Service Branch',
  'Sub Branch',
  'Corporate Branch',
  'Islamic Banking Branch',
  'Booth / Kiosk',
  'Off-site ATM',
  'Regional Office',
];

export function BranchForm({
  regions,
  clusters,
  managers,
}: {
  regions: { id: string; name: string }[];
  clusters: { id: string; name: string; regionId: string }[];
  managers: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const [regionId, setRegionId] = useState(regions[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = clusters.filter((c) => c.regionId === regionId);

  if (regions.length === 0) {
    return <p className="text-sm text-muted">Create a region before adding branches.</p>;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);

        const res = await fetch('/api/v1/branches', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: f.get('name'),
            code: f.get('code'),
            regionId: f.get('regionId'),
            clusterId: f.get('clusterId') || null,
            city: f.get('city'),
            address: f.get('address'),
            managerId: f.get('managerId') || null,
            contactNumber: f.get('contactNumber') || null,
            email: f.get('email') || null,
            openingDate: f.get('openingDate') || null,
            branchType: f.get('branchType'),
            status: f.get('status'),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? 'The branch could not be created');
          setBusy(false);
          return;
        }

        const body = await res.json();
        router.push(`/branches/${body.data.id}`);
        router.refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="b-name">
            Branch name
          </label>
          <input id="b-name" name="name" required className="input" placeholder="Multan Cantt" />
        </div>
        <div>
          <label className="label" htmlFor="b-code">
            Branch code
          </label>
          <input id="b-code" name="code" required className="input" placeholder="MUL-001" />
        </div>
        <div>
          <label className="label" htmlFor="b-region">
            Region
          </label>
          <select
            id="b-region"
            name="regionId"
            required
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            className="input"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="b-cluster">
            Cluster (optional)
          </label>
          <select id="b-cluster" name="clusterId" className="input">
            <option value="">None</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="b-city">
            City
          </label>
          <input id="b-city" name="city" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="b-type">
            Branch type
          </label>
          <select id="b-type" name="branchType" className="input" defaultValue={BRANCH_TYPES[0]}>
            {BRANCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="b-address">
          Address
        </label>
        <textarea id="b-address" name="address" required rows={2} className="input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="b-manager">
            Branch manager
          </label>
          <select id="b-manager" name="managerId" className="input">
            <option value="">Not assigned yet</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.email}
              </option>
            ))}
          </select>
          <p className="mt-1 text-2xs text-muted">
            Findings raised at this branch default to this person.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="b-contact">
            Contact number
          </label>
          <input id="b-contact" name="contactNumber" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="b-email">
            Branch email
          </label>
          <input id="b-email" name="email" type="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="b-opening">
            Opening date
          </label>
          <input id="b-opening" name="openingDate" type="date" className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="b-status">
          Status
        </label>
        <select id="b-status" name="status" className="input" defaultValue="ACTIVE">
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Create branch
      </button>
    </form>
  );
}
