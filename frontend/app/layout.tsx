import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { ToastContainer } from '@/components/layout/ToastContainer';
import { HealthPoller } from '@/components/layout/HealthPoller';

export const metadata: Metadata = {
  title: 'Council — Collaborative AI Agent Platform',
  description: 'Real-time multi-agent debate and decision platform for humans and AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%', colorScheme: 'dark' }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
        }}
      >
        <HealthPoller />
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto min-w-0">
            {children}
          </main>
        </div>
        <ToastContainer />
      </body>
    </html>
  );
}
