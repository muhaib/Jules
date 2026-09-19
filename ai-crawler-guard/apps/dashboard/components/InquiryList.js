'use client';

import { Fragment, useState } from 'react';
import { relativeTime } from '../lib/format';

const STATUSES = ['new', 'contacted', 'agreed', 'declined'];
const STATUS_COLORS = {
  new: 'var(--status-warning)',
  contacted: 'var(--series-1)',
  agreed: 'var(--status-good)',
  declined: 'var(--text-muted)',
};

const USE_LABELS = {
  training: 'Training a model',
  rag: 'Retrieval / grounding',
  search: 'Search indexing',
  evaluation: 'Evaluation',
  archive: 'Archive / research',
  other: 'Other',
};

export function InquiryList({ siteId, initial }) {
  const [inquiries, setInquiries] = useState(initial);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);

  async function patch(id, body) {
    setError(null);
    const response = await fetch(`/api/sites/${siteId}/inquiries/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError('Could not save that change.');
      return;
    }
    const { inquiry } = await response.json();
    setInquiries((list) => list.map((item) => (item.id === inquiry.id ? inquiry : item)));
  }

  if (!inquiries.length) {
    return (
      <div className="card">
        <h2>No inquiries yet</h2>
        <p className="sub small" style={{ margin: 0 }}>
          Inquiries arrive when a crawler you have set to &ldquo;Licensing page&rdquo; hits your site
          and someone fills in the form. Set at least one crawler to the licensing page on
          the Crawlers tab to open the funnel.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      {error && <p className="notice error" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>From</th>
              <th>Organisation</th>
              <th>Intended use</th>
              <th>Crawler</th>
              <th>Received</th>
              <th style={{ width: 150 }}>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inquiries.map((inquiry) => (
              <Fragment key={inquiry.id}>
                <tr>
                  <td>
                    <div>{inquiry.name}</div>
                    <a className="small" href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
                  </td>
                  <td className="muted">{inquiry.organization ?? '—'}</td>
                  <td className="muted">{USE_LABELS[inquiry.intended_use] ?? inquiry.intended_use ?? '—'}</td>
                  <td className="muted small">{inquiry.crawler_id ?? '—'}</td>
                  <td className="muted small">{relativeTime(inquiry.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="dot" style={{ background: STATUS_COLORS[inquiry.status] }} />
                      <select
                        value={inquiry.status}
                        style={{ minWidth: 118 }}
                        aria-label={`Status for the inquiry from ${inquiry.name}`}
                        onChange={(event) => patch(inquiry.id, { status: event.target.value })}
                      >
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button" className="ghost" style={{ padding: '4px 10px', fontSize: 13 }}
                      onClick={() => setOpen(open === inquiry.id ? null : inquiry.id)}
                    >
                      {open === inquiry.id ? 'Hide' : 'Open'}
                    </button>
                  </td>
                </tr>
                {open === inquiry.id && (
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
                      <p className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>
                        {inquiry.message || <span className="muted">No message.</span>}
                      </p>
                      <p className="muted small">
                        Requested {inquiry.requested_path ?? 'an unrecorded path'}
                        {inquiry.notified_at ? ' · notification email sent' : ' · no email sent (SMTP not configured)'}
                      </p>
                      <label className="field" style={{ maxWidth: 560 }}>
                        Your notes
                        <textarea
                          rows={3}
                          defaultValue={inquiry.notes ?? ''}
                          onBlur={(event) => {
                            if (event.target.value !== (inquiry.notes ?? '')) {
                              patch(inquiry.id, { notes: event.target.value });
                            }
                          }}
                        />
                      </label>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
