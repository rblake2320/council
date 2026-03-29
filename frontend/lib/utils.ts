import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AgentPosition, AgentStatus, CouncilMode, CouncilStatus } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Time formatting ────────────────────────────────────────────────────────

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(startStr: string, endStr?: string | null): string {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ── Status helpers ────────────────────────────────────────────────────────

export function councilStatusColor(status: CouncilStatus): string {
  switch (status) {
    case 'active': return 'var(--state-yes)';
    case 'paused': return 'var(--state-changed)';
    case 'completed': return 'var(--text-secondary)';
    case 'archived': return 'var(--text-muted)';
    default: return 'var(--text-secondary)';
  }
}

export function councilStatusLabel(status: CouncilStatus): string {
  switch (status) {
    case 'active': return 'Active';
    case 'paused': return 'Paused';
    case 'completed': return 'Completed';
    case 'archived': return 'Archived';
    default: return status;
  }
}

export function modeLabel(mode: CouncilMode): string {
  switch (mode) {
    case 'quick': return 'Quick';
    case 'standard': return 'Standard';
    case 'marathon': return 'Marathon';
    default: return mode;
  }
}

export function positionColor(position: AgentPosition): string {
  switch (position) {
    case 'YES': return 'var(--state-yes)';
    case 'NO': return 'var(--state-no)';
    case 'CHANGED': return 'var(--state-changed)';
    case 'ABSTAIN': return 'var(--text-secondary)';
    default: return 'var(--text-muted)';
  }
}

export function positionLabel(position: AgentPosition): string {
  switch (position) {
    case 'YES': return 'YES';
    case 'NO': return 'NO';
    case 'CHANGED': return 'CHANGED';
    case 'ABSTAIN': return 'ABSTAIN';
    default: return '—';
  }
}

// ── Agent color palette ────────────────────────────────────────────────────
// Deterministic color from agent name — used for avatars and name chips

const AGENT_COLORS = [
  '#7C6BF2', // violet
  '#22D387', // green
  '#5BBCF7', // blue
  '#F5A623', // amber
  '#F05A5A', // red
  '#A78BFA', // purple
  '#34D399', // emerald
  '#60A5FA', // sky
  '#FBBF24', // yellow
  '#F87171', // rose
];

export function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

export function agentInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Role badge color ──────────────────────────────────────────────────────

export function roleColor(role: string): { bg: string; text: string } {
  const r = role.toLowerCase();
  if (r.includes('advocate') || r.includes('devil')) {
    return { bg: 'rgba(240,90,90,0.15)', text: '#F05A5A' };
  }
  if (r.includes('research') || r.includes('analyst')) {
    return { bg: 'rgba(91,188,247,0.15)', text: '#5BBCF7' };
  }
  if (r.includes('build') || r.includes('forge') || r.includes('engineer')) {
    return { bg: 'rgba(245,166,35,0.15)', text: '#F5A623' };
  }
  if (r.includes('sentinel') || r.includes('security') || r.includes('audit')) {
    return { bg: 'rgba(240,90,90,0.12)', text: '#F87171' };
  }
  if (r.includes('twin') || r.includes('delegate')) {
    return { bg: 'rgba(167,139,250,0.15)', text: '#A78BFA' };
  }
  return { bg: 'rgba(124,107,242,0.15)', text: '#7C6BF2' };
}

// ── Confidence visual ─────────────────────────────────────────────────────

export function confidenceBorderColor(confidence?: number): string {
  if (confidence === undefined) return 'var(--border-subtle)';
  if (confidence >= 0.75) return 'var(--state-yes)';
  if (confidence >= 0.4) return 'var(--state-changed)';
  return 'var(--state-no)';
}

// ── Truncate text ─────────────────────────────────────────────────────────

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

// ── Agent status CSS class ────────────────────────────────────────────────

export function agentStatusClass(status: AgentStatus): string {
  switch (status) {
    case 'thinking': return 'animate-pulse-thinking';
    case 'speaking': return 'animate-pulse-violet';
    default: return '';
  }
}
