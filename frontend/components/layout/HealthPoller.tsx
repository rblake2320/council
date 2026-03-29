'use client';

import * as React from 'react';
import { getHealth } from '@/lib/api';
import { useAppStore } from '@/lib/stores';

// Polls /api/health every 30 seconds and updates app store
export function HealthPoller() {
  const setHealth = useAppStore((s) => s.setHealth);
  const setHealthLoading = useAppStore((s) => s.setHealthLoading);

  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      setHealthLoading(true);
      try {
        const h = await getHealth();
        if (!cancelled) setHealth(h);
      } catch {
        if (!cancelled) setHealth({ status: 'error', db: 'error' });
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setHealth, setHealthLoading]);

  return null;
}
