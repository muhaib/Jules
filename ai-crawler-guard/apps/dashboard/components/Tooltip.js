'use client';

export function Tooltip({ x, y, width, children }) {
  const flip = x > width * 0.6;
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(0, y - 8),
        pointerEvents: 'none',
        background: 'var(--surface-1)',
        border: '1px solid var(--line-strong)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgb(0 0 0 / 14%)',
        padding: '8px 10px',
        fontSize: 12.5,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        zIndex: 5,
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </div>
  );
}
