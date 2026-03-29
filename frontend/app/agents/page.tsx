'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getAgents } from '@/lib/api';
import { agentColor, roleColor, timeAgo } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import { Plus, Users, Bot, User, Globe } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AgentSummary } from '@/lib/types';

const queryClient = new QueryClient();

function AgentGridCard({ agent }: { agent: AgentSummary }) {
  const color = agentColor(agent.name);
  const rColor = roleColor(agent.role);
  const isTwin = !!agent.twin_of;

  return (
    <Link href={`/agents/${agent.id}`}>
      <Card hoverable className="h-full">
        <CardContent className="py-4">
          <div className="flex items-start gap-3 mb-3">
            <AgentAvatar name={agent.name} size="md" isTwin={isTwin} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-sm font-medium truncate" style={{ color }}>
                  {agent.name}
                </span>
                {isTwin && <Badge variant="twin" className="text-[10px] py-0 px-1.5 shrink-0">Twin</Badge>}
                {agent.is_external && <Badge variant="thinking" className="text-[10px] py-0 px-1.5 shrink-0">External</Badge>}
              </div>
              <span className="text-xs mt-0.5 block" style={{ color: rColor.text }}>
                {agent.role}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#1E2240]">
            <Badge variant="outline" className="text-[10px] font-mono truncate max-w-[140px]">
              {agent.model_preference}
            </Badge>
            <span className="text-[10px] text-[#4A5070]">{timeAgo(agent.created_at)}</span>
          </div>

          {isTwin && agent.twin_of && (
            <div className="mt-2 text-[10px] text-[#4A5070]">Twin of: {agent.twin_of}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <Bot size={40} className="text-[#4A5070] mb-4" />
      <p className="text-sm text-[#8B90B8] mb-4">{label}</p>
      <Link href="/agents/new">
        <Button variant="default" size="sm"><Plus size={14} />Create your first agent</Button>
      </Link>
    </div>
  );
}

function AgentsContent() {
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => getAgents(),
    refetchInterval: 30_000,
  });

  const pkaTeam = agents.filter((a) => !a.is_external && !a.twin_of);
  const twins = agents.filter((a) => !!a.twin_of);
  const external = agents.filter((a) => a.is_external);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-[#E8E8F0]">Agent Roster</h1>
          <Badge variant="secondary" className="text-sm px-3">{agents.length}</Badge>
        </div>
        <Link href="/agents/new">
          <Button variant="default" size="sm"><Plus size={14} />New Agent</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users size={48} className="text-[#4A5070] mb-4" />
          <h2 className="text-lg font-medium text-[#E8E8F0] mb-2">No agents yet</h2>
          <p className="text-sm text-[#8B90B8] mb-6 max-w-sm">
            Create your first AI agent or digital twin to start collaborative debates.
          </p>
          <Link href="/agents/new">
            <Button variant="default"><Plus size={16} />Create your first agent</Button>
          </Link>
        </div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList className="mb-6 w-fit">
            <TabsTrigger value="all">All ({agents.length})</TabsTrigger>
            <TabsTrigger value="pka"><Bot size={12} />PKA Team ({pkaTeam.length})</TabsTrigger>
            <TabsTrigger value="twins"><User size={12} />Digital Twins ({twins.length})</TabsTrigger>
            <TabsTrigger value="external"><Globe size={12} />External ({external.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {agents.map((a) => <AgentGridCard key={a.id} agent={a} />)}
            </div>
          </TabsContent>

          <TabsContent value="pka">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pkaTeam.length === 0 ? <EmptyState label="No PKA team agents yet" /> : pkaTeam.map((a) => <AgentGridCard key={a.id} agent={a} />)}
            </div>
          </TabsContent>

          <TabsContent value="twins">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {twins.length === 0 ? <EmptyState label="No digital twins yet — create one to attend meetings on your behalf" /> : twins.map((a) => <AgentGridCard key={a.id} agent={a} />)}
            </div>
          </TabsContent>

          <TabsContent value="external">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {external.length === 0 ? <EmptyState label="No external agents — external agents connect via API key" /> : external.map((a) => <AgentGridCard key={a.id} agent={a} />)}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentsContent />
    </QueryClientProvider>
  );
}
