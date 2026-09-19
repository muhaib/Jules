'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export function SiteTabs({ siteId }) {
  const pathname = usePathname();
  const base = `/sites/${siteId}`;
  const tabs = [
    ['', 'Overview'],
    ['/bots', 'Crawlers'],
    ['/robots', 'robots.txt'],
    ['/inquiries', 'Inquiries'],
    ['/install', 'Install'],
  ];
  return (
    <nav className="tabs">
      {tabs.map(([suffix, label]) => {
        const href = `${base}${suffix}`;
        return (
          <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="ghost"
      onClick={async () => {
        await fetch('/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function CopyButton({ text, label = 'Copy' }) {
  return (
    <button
      type="button"
      className="ghost"
      onClick={async (event) => {
        const button = event.currentTarget;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied';
          setTimeout(() => { button.textContent = label; }, 1600);
        } catch {
          button.textContent = 'Press Ctrl+C';
        }
      }}
    >
      {label}
    </button>
  );
}
