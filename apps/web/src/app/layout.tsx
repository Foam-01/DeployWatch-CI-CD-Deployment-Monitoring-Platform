import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

// Self-hosted at build time by next/font: no render-blocking request to Google at runtime.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DeployWatch — CI/CD & Deployment Monitoring',
  description:
    'Centralized monitoring for GitHub Actions workflows, deployments, service health and incidents.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#090d16',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
