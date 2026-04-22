import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nail Me — AI Nail Color Recommendations',
  description: 'Upload a hand photo and get curated nail colors matched to your skin tone.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Nail Me' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,   // prevent iOS double-tap zoom
  userScalable: false,
  viewportFit: 'cover', // respect iPhone notch / home bar
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
