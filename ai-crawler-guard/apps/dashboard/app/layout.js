import './globals.css';

export const metadata = {
  title: 'AI Crawler Guard',
  description: 'See which AI crawlers hit your site, and decide what each one gets.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
