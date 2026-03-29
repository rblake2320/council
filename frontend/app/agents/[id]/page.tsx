'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAgent,
  getAgentMemory,
  getAgentStats,
  rotateAgentKey,
  deleteAgent,
} from '@/lib/api';
import { agentColor, roleColor, timeAgo, formatTime } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import { useAppStore } from '@/lib/stores';
import {
  ArrowLeft,
  RotateCcw,
  Trash2,
  MessageSquare,
  Brain,
  User,
  Copy,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function AgentDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const addToast = useAppStore((s) => s.addToast);
  const qc = useQueryClient();
  const [showKeyModal, setShowKeyModal] = React.useState(false);
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [keyCopied, setKeyCopied] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['agent', params.id],
    queryFn: () => getAgent(params.id),
  });

  const { data: memory = [] } = useQuery({
    queryKey: ['agent-memory', params.id],
    queryFn: () => getAgentMemory(params.id),
    enabled: !!agent,
  });

  const { data: stats } = useQuery({
    queryKey: ['agent-stats', params.id],
    queryFn: () => getAgentStats(params.id),
    enabled: !!agent,
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotateAgentKey(params.id),
    onSuccess: (updated) => {
      if (updated.api_key) {
        setNewKey(updated.api_key);
        setShowKeyModal(true);
      }
      qc.invalidateQueries({ queryKey: ['agent', params.id] });
    },
    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(params.id),
    onSuccess: () => {
      addToast({ type: 'success', message: 'Agent deleted' });
      router.push('/agents');
    },
    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
  });

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (error || !agent) {
    return (
      <div className="p-6 text-center">
        <p className="text-[#F05A5A] mb-4">Agent not found</p>
        <Link href="/agents"><Button variant="outline" size="sm">Back to agents</Button></Link>
      </div>
    );
  }

  const color = agentColor(agent.name);
  const rColor = roleColor(agent.role);
  const isTwin = !!(agent.twin_of ?? (agent.config as Record<string, unknown>)?.twin_of);
  const twinOf = (agent.twin_of ?? (agent.config as Record<string, unknown>)?.twin_of) as string | undefined;
  const authScope = (agent.authorization_scope ?? (agent.config as Record<string, unknown>)?.authorization_scope) as
    | { level: string; domains: string[] }
    | undefined;
  const twinProfile = (agent.twin_profile ?? (agent.config as Record<string, unknown>)?.twin_profile) as
    | { expertise?: string[]; communication_style?: string; non_negotiables?: string[]; accuracy_score?: number }
    | undefined;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Key modal */}
      {showKeyModal && newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[rgba(11,13,20,0.85)] backdrop-blur-sm" onClick={() => setShowKeyModal(false)} />
          <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-[rgba(34,211,135,0.3)] bg-[#111320] p-6 animate-fade-in">
            <h2 className="text-base font-semibold text-[#E8E8F0] mb-2">New API Key</h2>
            <p className="text-sm text-[#8B90B8] mb-4">Store this securely — shown once only.</p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0B0D14] border border-[#1E2240] mb-4">
              <code className="flex-1 text-xs font-mono text-[#22D387] break-all">{newKey}</code>
              <button onClick={() => copyKey(newKey)} className="shrink-0 p-1.5 rounded text-[#8B90B8] hover:text-[#E8E8F0]">
                {keyCopied ? <CheckCircle size={14} style={{ color: 'var(--state-yes)' }} /> : <Copy size={14} />}
              </button>
            </div>
            <Button variant="default" className="w-full" onClick={() => setShowKeyModal(false)}>Got it</Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <Link href="/agents">
            <Button variant="ghost" size="sm"><ArrowLeft size={14} />Back</Button>
          </Link>
          <div className="flex items-center gap-3">
            <AgentAvatar name={agent.name} size="lg" isTwin={isTwin} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-mono font-semibold" style={{ color }}>
                  {agent.name}
                </h1>
                {isTwin && <Badge variant="twin">Twin</Badge>}
                {agent.is_external && <Badge variant="thinking">External</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm" style={{ color: rColor.text }}>{agent.role}</span>
                <span className="text-[#4A5070]">·</span>
                <Badge variant="outline" className="text-[10px] font-mono">{agent.model_preference}</Badge>
              </div>
              {twinOf && (
                <p className="text-xs text-[#8B90B8] mt-0.5">Twin of: <span style={{ color: 'var(--accent-primary)' }}>{twinOf}</span></p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => rotateMutation.mutate()}
            loading={rotateMutation.isPending}
          >
            <RotateCcw size={13} />
            Rotate Key
          </Button>
          {!confirmDelete ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} />
              Delete
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Confirm Delete
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            ['Councils', stats.total_councils],
            ['Messages', stats.total_messages],
            ['Memories', stats.memory_entries],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#1E2240] bg-[#111320] p-4 text-center">
              <div className="text-2xl font-bold text-[#E8E8F0]">{value}</div>
              <div className="text-xs text-[#8B90B8] mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="memory">
            <Brain size={12} />
            Memory ({memory.length})
          </TabsTrigger>
          {isTwin && <TabsTrigger value="twin"><User size={12} />Twin Profile</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-[#E8E8F0]">System Prompt</h3></CardHeader>
              <CardContent className="pt-0">
                <pre className="text-sm text-[#8B90B8] whitespace-pre-wrap leading-relaxed font-sans">
                  {agent.system_prompt}
                </pre>
              </CardContent>
            </Card>

            {agent.personality && (
              <Card>
                <CardHeader><h3 className="text-sm font-semibold text-[#E8E8F0]">Personality</h3></CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-[#8B90B8]">{agent.personality}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-[#E8E8F0]">Config</h3></CardHeader>
              <CardContent className="pt-0 flex flex-col gap-3">
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-[#8B90B8]">Agent ID</span>
                    <code className="text-[11px] font-mono text-[#E8E8F0]">{agent.id}</code>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-[#8B90B8]">Created</span>
                    <span className="text-xs text-[#E8E8F0]">{formatTime(agent.created_at)} · {timeAgo(agent.created_at)}</span>
                  </div>
                </div>
                {agent.webhook_url && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#8B90B8]">Webhook:</span>
                    <a href={agent.webhook_url} target="_blank" rel="noopener noreferrer" className="text-[#7C6BF2] hover:text-[#9B8EF7] flex items-center gap-1">
                      {agent.webhook_url} <ExternalLink size={10} />
                    </a>
                  </div>
                )}
                <div className="pt-2 border-t border-[#1E2240]">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => rotateMutation.mutate()}
                    loading={rotateMutation.isPending}
                  >
                    <RotateCcw size={13} />
                    Rotate API Key
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="memory">
          {memory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Brain size={36} className="text-[#4A5070] mb-3" />
              <p className="text-sm text-[#8B90B8]">No memories yet</p>
              <p className="text-xs text-[#4A5070] mt-1">Memories accumulate as the agent participates in councils</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {memory.map((m) => (
                <Card key={m.id}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary" className="text-[10px] font-mono">{m.memory_type}</Badge>
                          {m.council_id && (
                            <Link href={`/councils/${m.council_id}`}>
                              <Badge variant="outline" className="text-[10px] hover:border-[#7C6BF2] cursor-pointer">
                                <MessageSquare size={9} />
                                Council
                              </Badge>
                            </Link>
                          )}
                        </div>
                        <p className="text-sm text-[#E8E8F0] leading-relaxed">{m.content}</p>
                      </div>
                      <span className="text-[10px] text-[#4A5070] shrink-0">{timeAgo(m.created_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="twin">
          <div className="flex flex-col gap-4">
            {authScope && (
              <Card>
                <CardHeader><h3 className="text-sm font-semibold text-[#E8E8F0]">Authorization Scope</h3></CardHeader>
                <CardContent className="pt-0 flex flex-col gap-4">
                  <div>
                    <span className="text-xs text-[#8B90B8] block mb-2">Authorization Level</span>
                    <Badge variant={authScope.level === 'delegated' ? 'yes' : authScope.level === 'advisory' ? 'changed' : 'secondary'} className="text-sm px-3 py-1">
                      {authScope.level}
                    </Badge>
                  </div>
                  {authScope.domains?.length > 0 && (
                    <div>
                      <span className="text-xs text-[#8B90B8] block mb-2">Decision Domains</span>
                      <div className="flex flex-wrap gap-2">
                        {authScope.domains.map((d) => (
                          <Badge key={d} variant="default" className="text-xs">
                            {d.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {twinProfile && (
              <Card>
                <CardHeader><h3 className="text-sm font-semibold text-[#E8E8F0]">Twin Profile</h3></CardHeader>
                <CardContent className="pt-0 flex flex-col gap-4">
                  {twinProfile.accuracy_score !== undefined && (
                    <div>
                      <span className="text-xs text-[#8B90B8] block mb-2">Accuracy Score</span>
                      <Progress
                        value={twinProfile.accuracy_score * 100}
                        showValue
                        color="var(--state-yes)"
                        label="Calibration accuracy"
                      />
                    </div>
                  )}

                  {twinProfile.expertise && twinProfile.expertise.length > 0 && (
                    <div>
                      <span className="text-xs text-[#8B90B8] block mb-2">Expertise</span>
                      <div className="flex flex-wrap gap-2">
                        {twinProfile.expertise.map((e) => (
                          <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {twinProfile.communication_style && (
                    <div>
                      <span className="text-xs text-[#8B90B8] block mb-1">Communication Style</span>
                      <p className="text-sm text-[#E8E8F0]">{twinProfile.communication_style}</p>
                    </div>
                  )}

                  {twinProfile.non_negotiables && twinProfile.non_negotiables.length > 0 && (
                    <div>
                      <span className="text-xs text-[#8B90B8] block mb-2">Non-negotiables</span>
                      <ul className="flex flex-col gap-1">
                        {twinProfile.non_negotiables.map((n, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[#E8E8F0]">
                            <span className="text-[#F05A5A] mt-0.5 shrink-0">×</span>
                            {n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AgentDetailPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentDetailContent />
    </QueryClientProvider>
  );
}
