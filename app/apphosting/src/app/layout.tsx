import { publicPageConfig } from '#app/server/public-config';
import './globals.css';
import type { Metadata } from 'next';
import type { JSX, ReactNode } from 'react';

export const metadata: Metadata = {
  description: 'exe task review calls for Slack workspaces.',
  icons: {
    apple: '/exe-icon.png',
    icon: '/exe-icon.png',
  },
  metadataBase: new URL(publicPageConfig.appUrl ?? 'http://localhost:3000'),
  openGraph: {
    description: 'exe task review calls for Slack workspaces.',
    images: [
      {
        alt: 'exe',
        height: 1024,
        url: '/exe-icon.png',
        width: 1024,
      },
    ],
    title: 'exe',
  },
  title: 'exe',
  twitter: {
    card: 'summary',
    description: 'exe task review calls for Slack workspaces.',
    images: ['/exe-icon.png'],
    title: 'exe',
  },
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps): JSX.Element => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
