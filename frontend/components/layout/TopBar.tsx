'use client';

import * as React from 'react';
import { useAppStore } from '@/lib/stores';
import { Menu } from 'lucide-react';

interface TopBarProps {
  title?: string;
}

export function TopBar({ title }: TopBarProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <header className="lg:hidden h-14 flex items-center gap-3 px-4 border-b border-[#1E2240] bg-[#111320] sticky top-0 z-30">
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-md text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240] transition-colors"
      >
        <Menu size={18} />
      </button>
      {title && (
        <span className="text-sm font-medium text-[#E8E8F0]">{title}</span>
      )}
    </header>
  );
}
