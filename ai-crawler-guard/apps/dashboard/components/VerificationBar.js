'use client';

import { nf } from '../lib/format';

/**
 * Identity outcomes as one segmented bar. This one genuinely is a status
 * scale - good through critical - so it uses the reserved status colors, and
 * every segment carries a written label so the colour never stands alone.
 */
const STATES = [
  { key: 'verified', label: 'Verified', color: 'var(--status-good)', help: 'Reverse DNS or a published IP range confirmed the crawler.' },
  { key: 'unknown', label: 'Unconfirmed', color: 'var(--status-warning)', help: 'The check could not complete - a DNS timeout, or a range list that is not loaded.' },
  { key: 'unverifiable', label: 'No method', color: 'var(--status-serious)', help: 'This operator publishes no way to verify its crawler.' },
  { key: 'spoofed', label: 'Spoofed', color: 'var(--status-critical)', help: 'Something claimed to be this crawler and the check refuted it.' },
];

export function VerificationBar({ counts }) {
  const total = STATES.reduce((sum, state) => sum + (counts[state.key] ?? 0), 0);
  if (!total) {
    return <p className="muted small" style={{ margin: 0 }}>No identity checks recorded yet.</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 14, marginBottom: 12 }}>
        {STATES.map((state, index) => {
          const value = counts[state.key] ?? 0;
          if (!value) return null;
          const first = index === 0;
          return (
            <div
              key={state.key}
              title={`${state.label}: ${nf.format(value)}`}
              style={{
                flex: value,
                background: state.color,
                borderRadius: first ? '4px 2px 2px 4px' : '2px',
                minWidth: 3,
              }}
            />
          );
        })}
      </div>
      <dl style={{ display: 'grid', gap: 8, margin: 0 }}>
        {STATES.map((state) => {
          const value = counts[state.key] ?? 0;
          return (
            <div key={state.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="dot" style={{ background: state.color }} />
              <dt style={{ fontSize: 13 }}>{state.label}</dt>
              <dd style={{ margin: 0, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                {nf.format(value)}
                <span className="muted small"> ({Math.round((value / total) * 100)}%)</span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
        {STATES.find((s) => s.key === 'spoofed') && (counts.spoofed ?? 0) > 0
          ? 'Spoofed hits are requests that wore a crawler’s name and failed the identity check. They are blocked by default.'
          : 'An unconfirmed result is not the same as a failed one — the policy treats it as unknown, never as spoofed.'}
      </p>
    </div>
  );
}
