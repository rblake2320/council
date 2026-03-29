'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  getCouncil,
  getMessages,
  postMessage,
  runRound,
  pauseCouncil,
  resumeCouncil,
  endCouncil,
  synthesize,
  getSynthesis,
} from '@/lib/api';
import { subscribeToCouncil } from '@/lib/sse';
import { useCouncilStore, useAppStore } from '@/lib/stores';
import { truncate, formatDuration } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AgentCard } from '@/components/agents/AgentCard';
import { MessageBubble } from '@/components/councils/MessageBubble';
import { ThinkingIndicator } from '@/components/councils/ThinkingIndicator';
import { SynthesisPanel } from '@/components/councils/SynthesisPanel';
import {
  ArrowLeft,
  Play,
  Pause,
  Sparkles,
  StopCircle,
  Send,
  ChevronRight,
  Download,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AgentRuntimeState, Message } from '@/lib/types';

const queryClient = new QueryClient();

function buildMessageMap(messages: Message[]): Map<string, Message> {
  return new Map(messages.map((m) => [m.id, m]));
}

function HumanInputBox({
  councilId,
  disabled,
}: {
  councilId: string;
  disabled: boolean;
}) {
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const addToast = useAppStore((s) => s.addToast);
  const appendMessage = useCouncilStore((s) => s.appendMessage);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg = await postMessage(councilId, { content, role: 'human' });
      appendMessage(msg);
      setText('');
      textareaRef.current?.focus();
    } catch (err: unknown) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-[#1E2240] p-3 bg-[#111320] shrink-0">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Send a message to the council... (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none rounded-lg px-3 py-2.5 text-sm bg-[#0B0D14] border border-[#1E2240] text-[#E8E8F0] placeholder:text-[#4A5070] focus:outline-none focus:border-[#7C6BF2] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ minHeight: 40, maxHeight: 120, overflowY: 'auto' }}
        />
        <Button
          variant="default"
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          loading={sending}
          className="shrink-0"
        >
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}

function DebateContent() {
  const params = useParams<{ id: string }>();
  const addToast = useAppStore((s) => s.addToast);

  const {
    activeCouncil,
    messages,
    synthesis,
    agentRuntimeStates,
    typingAgents,
    sseConnected,
    councilStatus,
    currentRound,
    setActiveCouncil,
    setMessages,
    appendMessage,
    setSynthesis,
    setCouncilStatus,
    setSSEConnected,
    setAgentTyping,
    setCurrentRound,
    initAgentStates,
    clearActiveCouncil,
  } = useCouncilStore();

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [synthesizing, setSynthesizing] = React.useState(false);
  const [controlLoading, setControlLoading] = React.useState<string | null>(null);

  const { data: council, isLoading, error } = useQuery({
    queryKey: ['council', params.id],
    queryFn: () => getCouncil(params.id),
  });

  const { data: initialMessages = [] } = useQuery({
    queryKey: ['messages', params.id],
    queryFn: () => getMessages(params.id, { limit: 200 }),
    enabled: !!council,
  });

  React.useEffect(() => {
    if (council) {
      setActiveCouncil(council);
      initAgentStates(council.participants);
    }
    return () => { clearActiveCouncil(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [council?.id]);

  React.useEffect(() => {
    if (initialMessages.length > 0) setMessages(initialMessages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages.length]);

  React.useEffect(() => {
    if (!council) return;
    const sub = subscribeToCouncil(params.id, {
      onConnected: () => setSSEConnected(true),
      onDisconnected: () => setSSEConnected(false),
      onMessage: (msg) => appendMessage(msg),
      onTyping: (agentId, agentName, isTyping) => setAgentTyping(agentId, agentName, isTyping),
      onRoundStart: (round) => setCurrentRound(round),
      onSynthesis: (s) => setSynthesis(s),
      onStatusChange: (status) => setCouncilStatus(status),
    });
    return () => sub.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [council?.id]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Polling fallback — activates when SSE is disconnected (Redis unavailable or proxy issues).
  // Polls every 3 s and appends any new messages that arrived since the last known message.
  React.useEffect(() => {
    if (sseConnected || !council) return;

    let lastSeenId: string | undefined = messages[messages.length - 1]?.id;

    const timer = setInterval(async () => {
      try {
        const newMsgs = await getMessages(params.id, { limit: 20, after: lastSeenId });
        for (const m of newMsgs) {
          appendMessage(m);
          lastSeenId = m.id;
        }
      } catch {
        // ignore polling errors
      }
    }, 3_000);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sseConnected, council?.id]);

  React.useEffect(() => {
    if (council?.synthesis_id && !synthesis) {
      getSynthesis(params.id).then(setSynthesis).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [council?.synthesis_id]);

  async function handleRunRound() {
    setControlLoading('round');
    try {
      await runRound(params.id);
      addToast({ type: 'info', message: 'Round started — agents are debating' });
    } catch (err: unknown) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setControlLoading(null);
    }
  }

  async function handlePauseResume() {
    const action = councilStatus === 'active' ? 'pause' : 'resume';
    setControlLoading(action);
    try {
      const updated = councilStatus === 'active'
        ? await pauseCouncil(params.id)
        : await resumeCouncil(params.id);
      setActiveCouncil(updated);
    } catch (err: unknown) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setControlLoading(null);
    }
  }

  async function handleEnd() {
    if (!confirm('End this council? This cannot be undone.')) return;
    setControlLoading('end');
    try {
      const updated = await endCouncil(params.id);
      setActiveCouncil(updated);
      addToast({ type: 'success', message: 'Council ended' });
    } catch (err: unknown) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setControlLoading(null);
    }
  }

  async function handleSynthesize() {
    setSynthesizing(true);
    try {
      const s = await synthesize(params.id);
      setSynthesis(s);
      addToast({ type: 'success', message: 'Synthesis complete' });
    } catch (err: unknown) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Synthesis failed' });
    } finally {
      setSynthesizing(false);
    }
  }

  async function handleExport() {
    if (!activeCouncil) return;
    const data = {
      council: { title: activeCouncil.title, topic: activeCouncil.topic, status: activeCouncil.status },
      messages: messages.map((m) => ({
        agent: m.agent_name, role: m.role, content: m.content,
        position: m.metadata?.position, time: m.created_at,
      })),
      synthesis: synthesis ?? null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `council-${params.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full min-h-[300px]"><Spinner size="lg" /></div>;
  }

  if (error || !council) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-[#F05A5A] mb-4">Council not found</p>
        <Link href="/councils"><Button variant="outline" size="sm">Back to councils</Button></Link>
      </div>
    );
  }

  const messageMap = buildMessageMap(messages);
  const isCompleted = councilStatus === 'completed' || councilStatus === 'archived';
  const isActive = councilStatus === 'active';
  const typingAgentList = Array.from(typingAgents);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1E2240] bg-[#111320] shrink-0">
        <Link href="/councils">
          <Button variant="ghost" size="icon"><ArrowLeft size={14} /></Button>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#E8E8F0] truncate">{council.title}</span>
            <Badge variant={isActive ? 'yes' : isCompleted ? 'secondary' : 'changed'} className="text-[10px] shrink-0">
              {councilStatus ?? council.status}
            </Badge>
            {currentRound > 0 && (
              <Badge variant="outline" className="text-[10px] shrink-0">Round {currentRound}</Badge>
            )}
            <span className="text-[10px] text-[#4A5070] hidden sm:block">
              {messages.length} msgs · {formatDuration(council.created_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {sseConnected
            ? <Wifi size={11} style={{ color: 'var(--state-yes)' }} />
            : <WifiOff size={11} style={{ color: 'var(--state-no)' }} />
          }
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" onClick={handleRunRound}
            disabled={isCompleted || controlLoading === 'round'} loading={controlLoading === 'round'}>
            <Play size={11} /><span className="hidden sm:inline">Run Round</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handlePauseResume}
            disabled={isCompleted || !!controlLoading} loading={controlLoading === 'pause' || controlLoading === 'resume'}>
            {isActive ? <><Pause size={11} /><span className="hidden sm:inline">Pause</span></> : <><Play size={11} /><span className="hidden sm:inline">Resume</span></>}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSynthesize}
            disabled={isCompleted || synthesizing} loading={synthesizing}>
            <Sparkles size={11} /><span className="hidden sm:inline">Synthesize</span>
          </Button>
          {!isCompleted && (
            <Button variant="destructive" size="sm" onClick={handleEnd} disabled={!!controlLoading}>
              <StopCircle size={11} />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleExport}><Download size={13} /></Button>
          {synthesis && (
            <Link href={`/councils/${params.id}/synthesis`}>
              <Button variant="default" size="sm">Verdict <ChevronRight size={11} /></Button>
            </Link>
          )}
        </div>
      </div>

      {/* Three panels */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT — Agent roster */}
        <div className="hidden lg:flex flex-col w-56 shrink-0 border-r border-[#1E2240] bg-[#111320] overflow-y-auto">
          <div className="px-3 py-2.5 border-b border-[#1E2240]">
            <span className="text-[10px] font-semibold text-[#8B90B8] uppercase tracking-wider">
              Agents ({council.participants.length})
            </span>
          </div>
          <div className="flex flex-col gap-2 p-2.5">
            {council.participants.map((p) => {
              const state: AgentRuntimeState = agentRuntimeStates[p.agent_id] ?? {
                agentId: p.agent_id, status: 'idle', currentPosition: null, messageCount: 0,
              };
              return (
                <AgentCard
                  key={p.agent_id}
                  agentId={p.agent_id}
                  name={p.name}
                  role={p.role}
                  model={p.model_preference}
                  status={state.status}
                  currentPosition={state.currentPosition}
                  previousPosition={state.previousPosition}
                  positionChangedAt={state.positionChangedAt}
                  messageCount={state.messageCount}
                  isSpeaking={state.status === 'speaking'}
                  isThinking={state.status === 'thinking' || typingAgents.has(p.agent_id)}
                  confidence={state.confidence}
                />
              );
            })}
          </div>
        </div>

        {/* CENTER — Message stream */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0B0D14]">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <Sparkles size={32} className="text-[#4A5070] mb-3" />
                <p className="text-sm text-[#8B90B8] mb-1">No messages yet</p>
                <p className="text-xs text-[#4A5070]">Press "Run Round" to start the debate</p>
              </div>
            ) : (
              messages.map((msg) => {
                const replyToAgentName = msg.metadata?.reply_to_id
                  ? (messageMap.get(msg.metadata.reply_to_id as string)?.agent_name ?? null)
                  : null;
                return (
                  <MessageBubble key={msg.id} message={msg} replyToAgent={replyToAgentName} />
                );
              })
            )}

            {typingAgentList.map((agentId) => {
              const participant = council.participants.find((p) => p.agent_id === agentId);
              if (!participant) return null;
              return <ThinkingIndicator key={agentId} agentName={participant.name} />;
            })}

            <div ref={messagesEndRef} />
          </div>

          <HumanInputBox councilId={params.id} disabled={isCompleted} />
        </div>

        {/* RIGHT — Synthesis rail */}
        <div className="hidden xl:flex flex-col w-72 shrink-0 border-l border-[#1E2240] bg-[#111320] overflow-y-auto">
          <div className="px-4 py-2.5 border-b border-[#1E2240]">
            <span className="text-[10px] font-semibold text-[#8B90B8] uppercase tracking-wider">
              Live Synthesis
            </span>
          </div>
          <div className="p-4 flex-1">
            <SynthesisPanel
              council={activeCouncil ?? council}
              synthesis={synthesis}
              agentStates={agentRuntimeStates}
              onRunSynthesis={handleSynthesize}
              synthesizing={synthesizing}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CouncilDebatePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <DebateContent />
    </QueryClientProvider>
  );
}
