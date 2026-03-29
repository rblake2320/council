'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getCouncils, getAgents, getHealth } from '@/lib/api';
import { councilStatusColor, councilStatusLabel, modeLabel, timeAgo, formatDuration } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import {
  MessageSquare,
  Users,
  Activity,
  CheckCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 border border-[#1E2240] bg-[#111320]"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#8B90B8] uppercase tracking-wider">
          {label}
        </span>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-[#E8E8F0]">{value}</div>
    </div>
  );
}

function DashboardContent() {
  const { data: councils = [], isLoading: councilsLoading } = useQuery({
    queryKey: ['councils'],
    queryFn: () => getCouncils(),
    refetchInterval: 15_000,
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => getAgents(),
    refetchInterval: 30_000,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });

  const activeCouncils = councils.filter((c) => c.status === 'active');
  const completedToday = councils.filter((c) => {
    if (!c.completed_at) return false;
    const today = new Date();
    const d = new Date(c.completed_at);
    return d.toDateString() === today.toDateString();
  });

  const totalMessages = councils.reduce((sum, c) => sum + (c.message_count ?? 0), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#E8E8F0]">Dashboard</h1>
          <p className="text-sm text-[#8B90B8] mt-0.5">
            Welcome back. Your AI council is ready.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/agents/new">
            <Button variant="outline" size="sm">
              <Users size={14} />
              New Agent
            </Button>
          </Link>
          <Link href="/councils/new">
            <Button variant="default" size="sm">
              <Plus size={14} />
              New Council
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Councils"
          value={councilsLoading ? '—' : activeCouncils.length}
          icon={<Activity size={16} />}
          color="var(--state-yes)"
        />
        <StatCard
          label="Total Agents"
          value={agentsLoading ? '—' : agents.length}
          icon={<Users size={16} />}
          color="var(--accent-primary)"
        />
        <StatCard
          label="Debates Today"
          value={councilsLoading ? '—' : councils.filter((c) => {
            const d = new Date(c.created_at);
            return d.toDateString() === new Date().toDateString();
          }).length}
          icon={<TrendingUp size={16} />}
          color="var(--state-thinking)"
        />
        <StatCard
          label="Decisions Made"
          value={councilsLoading ? '—' : completedToday.length}
          icon={<CheckCircle size={16} />}
          color="var(--state-changed)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active councils */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#E8E8F0]">Active Councils</h2>
            <Link href="/councils" className="text-xs text-[#7C6BF2] hover:text-[#9B8EF7] flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {councilsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : activeCouncils.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare size={32} className="mx-auto mb-3 text-[#4A5070]" />
                <p className="text-sm text-[#8B90B8] mb-4">No active councils</p>
                <Link href="/councils/new">
                  <Button variant="default" size="sm">
                    <Plus size={14} />
                    Start a Council
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {activeCouncils.slice(0, 5).map((council) => (
                <Link key={council.id} href={`/councils/${council.id}`}>
                  <Card hoverable>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium text-[#E8E8F0] truncate">
                              {council.title}
                            </span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {modeLabel(council.mode)}
                            </Badge>
                          </div>
                          <p className="text-xs text-[#8B90B8] line-clamp-1">
                            {council.topic}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-[#4A5070]">
                            <span>{council.participant_count} agents</span>
                            <span>{council.message_count} messages</span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {formatDuration(council.created_at)}
                            </span>
                          </div>
                        </div>
                        <div
                          className="h-2 w-2 rounded-full shrink-0 mt-1.5"
                          style={{ background: councilStatusColor(council.status) }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Side panel: agents + health */}
        <div className="flex flex-col gap-4">
          {/* System health */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-[#E8E8F0]">System Health</h3>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-2">
                {[
                  ['API', health?.status ?? 'checking'],
                  ['Database', health?.db ?? 'checking'],
                  ['Redis', health?.redis ?? 'checking'],
                ].map(([label, status]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-[#8B90B8]">{label}</span>
                    <span
                      className="font-medium"
                      style={{
                        color:
                          status === 'ok'
                            ? 'var(--state-yes)'
                            : status === 'checking'
                            ? 'var(--text-muted)'
                            : status === 'unavailable'
                            ? 'var(--state-changed)'
                            : 'var(--state-no)',
                      }}
                    >
                      {status === 'ok'
                        ? 'Online'
                        : status === 'checking'
                        ? '...'
                        : status === 'unavailable'
                        ? 'Unavailable'
                        : 'Error'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent agents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[#E8E8F0]">Agents</h3>
                <Link href="/agents" className="text-xs text-[#7C6BF2] hover:text-[#9B8EF7]">
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {agentsLoading ? (
                <Spinner size="sm" className="mx-auto" />
              ) : agents.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-[#4A5070] mb-3">No agents yet</p>
                  <Link href="/agents/new">
                    <Button variant="outline" size="sm">
                      <Plus size={12} />
                      Create Agent
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {agents.slice(0, 6).map((agent) => (
                    <Link key={agent.id} href={`/agents/${agent.id}`}>
                      <div className="flex items-center gap-2.5 py-1.5 rounded-md hover:bg-[#1E2240] px-1 transition-colors">
                        <AgentAvatar
                          name={agent.name}
                          size="xs"
                          isTwin={!!agent.twin_of}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono font-medium text-[#E8E8F0] truncate">
                            {agent.name}
                          </div>
                          <div className="text-[10px] text-[#4A5070] truncate">
                            {agent.role}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick stats */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8B90B8]">Total councils</span>
                  <span className="text-[#E8E8F0] font-medium">{councils.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B90B8]">Total messages</span>
                  <span className="text-[#E8E8F0] font-medium">{totalMessages.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B90B8]">Completed</span>
                  <span className="text-[#E8E8F0] font-medium">
                    {councils.filter((c) => c.status === 'completed').length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContent />
    </QueryClientProvider>
  );
}
