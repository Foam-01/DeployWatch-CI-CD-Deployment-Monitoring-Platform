import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DeployWatch — Production CI/CD & Deployment Monitoring',
  description: 'Real-time multi-project CI/CD observability, GitHub Actions webhook ingestion, automated health checking, and incident triage platform.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
