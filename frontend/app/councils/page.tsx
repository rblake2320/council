'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getCouncils } from '@/lib/api';
import {
  councilStatusColor,
  councilStatusLabel,
  modeLabel,
  timeAgo,
  formatDuration,
  truncate,
} from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import { Plus, MessageSquare, Clock, Users } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CouncilSummary, CouncilStatus } from '@/lib/types';

const queryClient = new QueryClient();

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
] as const;

function CouncilCard({ council }: { council: CouncilSummary }) {
  const isActive = council.status === 'active';

  return (
    <Link href={`/councils/${council.id}`}>
      <Card hoverable>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: councilStatusColor(council.status) }}
                />
                <span className="text-sm font-medium text-[#E8E8F0] truncate">
                  {council.title}
                </span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {modeLabel(council.mode)}
                </Badge>
                {isActive && (
                  <Badge variant="yes" className="text-[10px] shrink-0">
                    Live
                  </Badge>
                )}
              </div>

              {/* Topic */}
              <p className="text-xs text-[#8B90B8] line-clamp-2 mb-3">
                {truncate(council.topic, 120)}
              </p>

              {/* Meta row */}
              <div className="flex items-center gap-4 text-[10px] text-[#4A5070]">
                <span className="flex items-center gap-1">
                  <Users size={10} />
                  {council.participant_count} agents
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare size={10} />
                  {council.message_count} messages
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {isActive
                    ? formatDuration(council.created_at)
                    : timeAgo(council.created_at)}
                </span>
                <span
                  className="ml-auto"
                  style={{ color: councilStatusColor(council.status) }}
                >
                  {councilStatusLabel(council.status)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CouncilsContent() {
  const [filter, setFilter] = React.useState<string>('all');

  const { data: councils = [], isLoading } = useQuery({
    queryKey: ['councils'],
    queryFn: () => getCouncils(),
    refetchInterval: 10_000,
  });

  const filtered = React.useMemo(() => {
    if (filter === 'all') return councils;
    return councils.filter((c) => c.status === filter);
  }, [councils, filter]);

  const countByStatus = React.useMemo(() => {
    const counts: Record<string, number> = { all: councils.length };
    for (const c of councils) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return counts;
  }, [councils]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-[#E8E8F0]">Councils</h1>
          <Badge variant="secondary" className="text-sm px-3">{councils.length}</Badge>
        </div>
        <Link href="/councils/new">
          <Button variant="default" size="sm">
            <Plus size={14} />
            New Council
          </Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map((tab) => {
          const count = countByStatus[tab.key] ?? 0;
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
              style={{
                background: isActive ? 'rgba(124,107,242,0.15)' : 'transparent',
                border: isActive ? '1px solid rgba(124,107,242,0.4)' : '1px solid #1E2240',
                color: isActive ? '#7C6BF2' : '#8B90B8',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="text-[10px] rounded-full px-1.5 py-0.5"
                  style={{
                    background: isActive ? 'rgba(124,107,242,0.2)' : '#1E2240',
                    color: isActive ? '#7C6BF2' : '#4A5070',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Council list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare size={48} className="text-[#4A5070] mb-4" />
          <h2 className="text-lg font-medium text-[#E8E8F0] mb-2">
            {filter === 'all' ? 'No councils yet' : `No ${filter} councils`}
          </h2>
          <p className="text-sm text-[#8B90B8] mb-6 max-w-sm">
            {filter === 'all'
              ? 'Start your first council to begin collaborative AI debates and decisions.'
              : `No councils with status "${filter}" found.`}
          </p>
          {filter === 'all' && (
            <Link href="/councils/new">
              <Button variant="default">
                <Plus size={16} />
                Start a Council
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((council) => (
            <CouncilCard key={council.id} council={council} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CouncilsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <CouncilsContent />
    </QueryClientProvider>
  );
}
