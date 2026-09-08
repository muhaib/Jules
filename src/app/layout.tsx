import type { Metadata, Viewport } from 'next';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'BranchCheck',
    template: '%s · BranchCheck',
  },
  description:
    'Branch inspection, facility compliance and corrective action management for multi-site organizations.',
  applicationName: 'BranchCheck',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#154A91',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
