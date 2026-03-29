'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/stores';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Settings,
  X,
  Wifi,
  WifiOff,
  Activity,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/councils', label: 'Councils', icon: MessageSquare },
  { href: '/agents', label: 'Agents', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
}

function CouncilLogo() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <div
        className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: 'linear-gradient(135deg, #7C6BF2 0%, #5BBCF7 100%)',
        }}
      >
        <Activity size={14} className="text-white" />
      </div>
      <span
        className="font-semibold text-base tracking-tight"
        style={{
          background: 'linear-gradient(90deg, #7C6BF2, #9B8EF7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Council
      </span>
    </div>
  );
}

function SystemStatus() {
  const health = useAppStore((s) => s.health);
  const isOk = health?.status === 'ok';
  const isDegraded = health?.status === 'degraded';

  return (
    <div className="px-4 py-3 border-t border-[#1E2240]">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#0B0D14] border border-[#1E2240]">
        {!health ? (
          <>
            <span className="h-2 w-2 rounded-full bg-[#4A5070] animate-blink shrink-0" />
            <span className="text-xs text-[#4A5070]">Connecting...</span>
          </>
        ) : isOk ? (
          <>
            <Wifi size={12} style={{ color: 'var(--state-yes)' }} className="shrink-0" />
            <span className="text-xs" style={{ color: 'var(--state-yes)' }}>
              Online
            </span>
          </>
        ) : isDegraded ? (
          <>
            <WifiOff size={12} style={{ color: 'var(--state-changed)' }} className="shrink-0" />
            <span className="text-xs" style={{ color: 'var(--state-changed)' }}>
              Degraded
            </span>
          </>
        ) : (
          <>
            <WifiOff size={12} style={{ color: 'var(--state-no)' }} className="shrink-0" />
            <span className="text-xs" style={{ color: 'var(--state-no)' }}>
              Error
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  const sidebarContent = (
    <nav className="flex flex-col h-full">
      <CouncilLogo />

      <div className="flex-1 px-3 py-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium',
                'transition-all duration-150',
                isActive
                  ? 'bg-[rgba(124,107,242,0.15)] text-[#7C6BF2]'
                  : 'text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[rgba(255,255,255,0.04)]',
              )}
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>

      <SystemStatus />
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col w-56 shrink-0 border-r border-[#1E2240] bg-[#111320] h-screen sticky top-0',
          className,
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-[rgba(11,13,20,0.8)] z-40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed left-0 top-0 h-full w-56 z-50 bg-[#111320] border-r border-[#1E2240] flex flex-col">
            <div className="flex items-center justify-between pr-4">
              <CouncilLogo />
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-md text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 flex flex-col px-3 py-2 overflow-y-auto">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium mb-0.5',
                      'transition-all duration-150',
                      isActive
                        ? 'bg-[rgba(124,107,242,0.15)] text-[#7C6BF2]'
                        : 'text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[rgba(255,255,255,0.04)]',
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
            <SystemStatus />
          </aside>
        </>
      )}
    </>
  );
}
