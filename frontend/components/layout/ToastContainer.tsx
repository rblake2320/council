'use client';

import * as React from 'react';
import { useAppStore, type Toast } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useAppStore((s) => s.removeToast);

  const icons = {
    success: <CheckCircle size={14} style={{ color: 'var(--state-yes)' }} />,
    error: <XCircle size={14} style={{ color: 'var(--state-no)' }} />,
    info: <Info size={14} style={{ color: 'var(--state-thinking)' }} />,
    warning: <AlertTriangle size={14} style={{ color: 'var(--state-changed)' }} />,
  };

  const borderColors = {
    success: 'rgba(34,211,135,0.3)',
    error: 'rgba(240,90,90,0.3)',
    info: 'rgba(91,188,247,0.3)',
    warning: 'rgba(245,166,35,0.3)',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg',
        'bg-[#181B2E] border shadow-lg animate-slide-in-right',
        'max-w-sm min-w-[260px]',
      )}
      style={{ borderColor: borderColors[toast.type] }}
    >
      <div className="mt-0.5 shrink-0">{icons[toast.type]}</div>
      <p className="flex-1 text-sm text-[#E8E8F0] leading-snug">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 p-0.5 rounded text-[#4A5070] hover:text-[#8B90B8] transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
}
