'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACTION_HELP, ACTION_LABELS, PURPOSE_LABELS } from '../lib/format';

const ACTIONS = ['allow', 'log', 'license', 'block'];
// The same three hues the overview chart uses for outcomes, so a row's dot
// and the "Daily traffic by outcome" legend mean the same thing.
const ACTION_COLORS = {
  allow: 'var(--series-1)',
  log: 'var(--text-muted)',
  license: 'var(--series-2)',
  block: 'var(--series-3)',
};

export function PolicyEditor({ siteId, crawlers, policy: initial, catalogVersion }) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initial);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(() => JSON.stringify(policy) !== JSON.stringify(initial), [policy, initial]);

  const actionFor = (crawler) => policy.rules?.[crawler.id]?.action ?? policy.defaultAction;
  const requireVerified = (crawler) => policy.rules?.[crawler.id]?.requireVerified === true;

  function setRule(id, patch) {
    setPolicy((current) => {
      const rules = { ...(current.rules ?? {}) };
      const next = { ...(rules[id] ?? {}), ...patch };
      // A rule that sets nothing is not a rule; drop it so the stored policy
      // stays the shortest thing that describes the owner's choices.
      if (!next.action && !next.requireVerified && !next.paths?.length) delete rules[id];
      else rules[id] = next;
      return { ...current, rules };
    });
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    const response = await fetch(`/api/sites/${siteId}/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policy }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setStatus({ ok: true, message: 'Saved. Deployed middleware picks this up on its next poll, within a minute by default.' });
      router.refresh();
    } else {
      setStatus({ ok: false, message: body.details?.message ?? body.error ?? 'Could not save.' });
    }
    setBusy(false);
  }

  const groups = [
    ['training', 'Training crawlers', 'These collect content to train or fine-tune models.'],
    ['search', 'Search and answer engines', 'These build indexes that can send you traffic. Blocking them removes you from those results.'],
    ['user-fetch', 'On-demand fetchers', 'These fetch a page because a person asked an assistant about it. Blocking one blocks a human’s request.'],
    ['other', 'Other', null],
  ];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Defaults</h2>
            <p className="sub small" style={{ margin: 0 }}>Applied to any crawler you have not decided about.</p>
          </div>
        </div>
        <div className="grid two">
          <label className="field">
            Crawlers with no rule
            <select
              value={policy.defaultAction}
              onChange={(event) => setPolicy({ ...policy, defaultAction: event.target.value })}
            >
              {ACTIONS.map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}
            </select>
            <span className="muted small">{ACTION_HELP[policy.defaultAction]}</span>
          </label>
          <label className="field">
            Requests that fail the identity check
            <select
              value={policy.onSpoofed}
              onChange={(event) => setPolicy({ ...policy, onSpoofed: event.target.value })}
            >
              {ACTIONS.map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}
            </select>
            <span className="muted small">
              Something wearing a crawler&rsquo;s name that reverse DNS or the published IP
              ranges positively refuted. Blocking is the safe default.
            </span>
          </label>
        </div>
        <label className="field" style={{ maxWidth: 420, marginBottom: 0 }}>
          When the identity check cannot answer
          <select
            value={policy.onUnknown}
            onChange={(event) => setPolicy({ ...policy, onUnknown: event.target.value })}
          >
            <option value="inherit">Use the crawler&rsquo;s own rule</option>
            {ACTIONS.map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}
          </select>
          <span className="muted small">
            A DNS timeout is not evidence of spoofing. Leave this on the crawler&rsquo;s own
            rule unless you have a reason not to.
          </span>
        </label>
      </div>

      {groups.map(([purpose, title, help]) => {
        const rows = crawlers.filter((crawler) => (crawler.purpose ?? 'other') === purpose);
        if (!rows.length) return null;
        return (
          <div className="card" key={purpose}>
            <div className="card-head">
              <div>
                <h2>{title}</h2>
                {help && <p className="sub small" style={{ margin: 0 }}>{help}</p>}
              </div>
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Crawler</th>
                    <th>Operator</th>
                    <th>Identity check</th>
                    <th style={{ width: 170 }}>What it gets</th>
                    <th>Only when verified</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((crawler) => {
                    const action = actionFor(crawler);
                    return (
                      <tr key={crawler.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="dot" style={{ background: ACTION_COLORS[action] }} />
                            <span>
                              {crawler.name}
                              {crawler.deprecated && <span className="muted small"> (retired token)</span>}
                            </span>
                          </div>
                          {crawler.note && <div className="muted small" style={{ maxWidth: 460 }}>{crawler.note}</div>}
                          {crawler.robotsOnly && !crawler.note && (
                            <div className="muted small">
                              robots.txt control only &mdash; never appears in a User-Agent header,
                              so the middleware cannot enforce it.
                            </div>
                          )}
                        </td>
                        <td className="muted">{crawler.operator}</td>
                        <td>
                          {crawler.verifiable
                            ? <span className="pill">{crawler.verificationMethods.join(' + ')}</span>
                            : <span className="pill muted" title="This operator publishes no reverse DNS or IP list.">none published</span>}
                        </td>
                        <td>
                          <select
                            value={action}
                            aria-label={`Policy for ${crawler.name}`}
                            onChange={(event) => setRule(crawler.id, {
                              action: event.target.value === policy.defaultAction ? undefined : event.target.value,
                            })}
                          >
                            {ACTIONS.map((option) => (
                              <option key={option} value={option}>{ACTION_LABELS[option]}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            style={{ width: 16, height: 16 }}
                            disabled={!crawler.verifiable || crawler.robotsOnly}
                            checked={requireVerified(crawler)}
                            aria-label={`Require a verified identity for ${crawler.name}`}
                            onChange={(event) => setRule(crawler.id, {
                              requireVerified: event.target.checked || undefined,
                            })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div
        className="card"
        style={{ position: 'sticky', bottom: 16, marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
      >
        <button type="button" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : dirty ? 'Save policy' : 'Saved'}
        </button>
        {status && (
          <span className={status.ok ? 'small muted' : 'notice error small'}>{status.message}</span>
        )}
        <span className="spacer" style={{ flex: 1 }} />
        <span className="muted small">Signature list {catalogVersion}</span>
      </div>
    </>
  );
}
