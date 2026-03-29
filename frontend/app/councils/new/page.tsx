'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAgents, createCouncil } from '@/lib/api';
import { useAppStore } from '@/lib/stores';
import { agentColor, roleColor } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import { ArrowLeft, ArrowRight, Check, Plus, X, Search } from 'lucide-react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CouncilMode } from '@/lib/types';

const queryClient = new QueryClient();

const STEPS = [
  { id: 1, label: 'Basics' },
  { id: 2, label: 'Participants' },
  { id: 3, label: 'Type' },
  { id: 4, label: 'Options' },
  { id: 5, label: 'Review' },
];

const MODE_OPTIONS = [
  { value: 'quick', label: 'Quick — 3 rounds, fast synthesis' },
  { value: 'standard', label: 'Standard — 5 rounds, balanced depth' },
  { value: 'marathon', label: 'Marathon — unlimited rounds, deep debate' },
];

const MEETING_TYPES = [
  {
    key: 'internal',
    label: 'Internal',
    desc: 'PKA AI agents debate among themselves. No external participants.',
    icon: '🤖',
  },
  {
    key: 'twin-meeting',
    label: 'Twin Meeting',
    desc: 'Digital twins represent their humans and reach decisions on their behalf.',
    icon: '👥',
  },
  {
    key: 'mixed',
    label: 'Mixed',
    desc: 'Both AI agents and digital twins participate side by side.',
    icon: '🔀',
  },
  {
    key: 'open',
    label: 'Open',
    desc: 'Any external AI agent with an API key can join and participate.',
    icon: '🌐',
  },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, idx) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200"
              style={{
                background:
                  step.id < currentStep
                    ? 'var(--state-yes)'
                    : step.id === currentStep
                    ? 'var(--accent-primary)'
                    : '#1E2240',
                color:
                  step.id <= currentStep ? '#fff' : '#4A5070',
              }}
            >
              {step.id < currentStep ? <Check size={12} /> : step.id}
            </div>
            <span
              className="text-xs font-medium hidden sm:block"
              style={{
                color: step.id === currentStep ? '#E8E8F0' : '#4A5070',
              }}
            >
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div
              className="flex-1 h-px"
              style={{
                background: step.id < currentStep ? 'var(--state-yes)' : '#1E2240',
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

interface FormData {
  title: string;
  topic: string;
  mode: CouncilMode;
  selectedAgentIds: string[];
  meetingType: string;
  estimatedMinutes: string;
  webhookUrl: string;
}

function NewCouncilContent() {
  const router = useRouter();
  const addToast = useAppStore((s) => s.addToast);
  const [step, setStep] = React.useState(1);
  const [agentSearch, setAgentSearch] = React.useState('');

  const [form, setForm] = React.useState<FormData>({
    title: '',
    topic: '',
    mode: 'standard',
    selectedAgentIds: [],
    meetingType: 'internal',
    estimatedMinutes: '30',
    webhookUrl: '',
  });

  const [errors, setErrors] = React.useState<Partial<Record<keyof FormData, string>>>({});

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => getAgents(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCouncil({
        title: form.title.trim(),
        topic: form.topic.trim(),
        mode: form.mode,
        agent_ids: form.selectedAgentIds,
        config: {
          meeting_type: form.meetingType,
          estimated_duration_minutes: parseInt(form.estimatedMinutes) || 30,
          human_notification_url: form.webhookUrl.trim() || undefined,
        },
      }),
    onSuccess: (council) => {
      addToast({ type: 'success', message: `Council "${council.title}" created` });
      router.push(`/councils/${council.id}`);
    },
    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
  });

  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      a.role.toLowerCase().includes(agentSearch.toLowerCase()),
  );

  function set(field: keyof FormData, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleAgent(id: string) {
    setForm((f) => ({
      ...f,
      selectedAgentIds: f.selectedAgentIds.includes(id)
        ? f.selectedAgentIds.filter((x) => x !== id)
        : [...f.selectedAgentIds, id],
    }));
  }

  function validateStep(s: number): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (s === 1) {
      if (!form.title.trim()) e.title = 'Title is required';
      if (!form.topic.trim() || form.topic.length < 10)
        e.topic = 'Topic must be at least 10 characters';
    }
    if (s === 2) {
      if (form.selectedAgentIds.length === 0)
        e.selectedAgentIds = 'Select at least one agent';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => s - 1);
  }

  const selectedAgents = agents.filter((a) => form.selectedAgentIds.includes(a.id));

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/councils">
          <Button variant="ghost" size="sm"><ArrowLeft size={14} />Back</Button>
        </Link>
        <h1 className="text-2xl font-semibold text-[#E8E8F0]">New Council</h1>
      </div>

      <StepIndicator currentStep={step} />

      {/* Step 1: Basics */}
      {step === 1 && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-[#E8E8F0]">Council Basics</h2></CardHeader>
          <CardContent className="pt-0 flex flex-col gap-4">
            <Input
              label="Title"
              placeholder="e.g. Q4 Strategy Review, Pricing Model Debate"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              error={errors.title}
            />
            <Textarea
              label="Topic / Question"
              placeholder="What specific question should the council debate? Be precise."
              value={form.topic}
              onChange={(e) => set('topic', e.target.value)}
              error={errors.topic}
              hint="This is what agents will debate. The more specific, the better the output."
              className="min-h-[100px]"
            />
            <Select
              label="Debate Mode"
              options={MODE_OPTIONS}
              value={form.mode}
              onChange={(v) => set('mode', v as CouncilMode)}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 2: Participants */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#E8E8F0]">Select Participants</h2>
              {form.selectedAgentIds.length > 0 && (
                <Badge variant="default">{form.selectedAgentIds.length} selected</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {errors.selectedAgentIds && (
              <p className="text-xs text-[#F05A5A] mb-3">{errors.selectedAgentIds}</p>
            )}
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4A5070]" />
              <input
                placeholder="Search agents..."
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 text-sm rounded-md bg-[#0B0D14] border border-[#1E2240] text-[#E8E8F0] placeholder:text-[#4A5070] focus:outline-none focus:border-[#7C6BF2]"
              />
            </div>

            {agentsLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : filteredAgents.length === 0 ? (
              <p className="text-sm text-[#4A5070] text-center py-6">No agents found</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredAgents.map((agent) => {
                  const selected = form.selectedAgentIds.includes(agent.id);
                  const color = agentColor(agent.name);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className="flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 text-left w-full"
                      style={{
                        background: selected ? 'rgba(124,107,242,0.08)' : 'transparent',
                        borderColor: selected ? '#7C6BF2' : '#1E2240',
                      }}
                    >
                      <AgentAvatar name={agent.name} size="sm" isTwin={!!agent.twin_of} />
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm font-medium block truncate" style={{ color }}>
                          {agent.name}
                        </span>
                        <span className="text-xs text-[#8B90B8] truncate block">{agent.role}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                        {agent.model_preference.split(':')[0]}
                      </Badge>
                      {selected && <Check size={14} style={{ color: 'var(--accent-primary)' }} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Meeting type */}
      {step === 3 && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-[#E8E8F0]">Meeting Type</h2></CardHeader>
          <CardContent className="pt-0 flex flex-col gap-3">
            {MEETING_TYPES.map((type) => (
              <button
                key={type.key}
                type="button"
                onClick={() => set('meetingType', type.key)}
                className="flex items-start gap-4 p-4 rounded-lg border transition-all duration-150 text-left w-full"
                style={{
                  background: form.meetingType === type.key ? 'rgba(124,107,242,0.08)' : 'transparent',
                  borderColor: form.meetingType === type.key ? '#7C6BF2' : '#1E2240',
                }}
              >
                <span className="text-xl shrink-0">{type.icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#E8E8F0]">{type.label}</span>
                    {form.meetingType === type.key && (
                      <Check size={13} style={{ color: 'var(--accent-primary)' }} />
                    )}
                  </div>
                  <p className="text-xs text-[#8B90B8] mt-0.5">{type.desc}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Options */}
      {step === 4 && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-[#E8E8F0]">Options</h2></CardHeader>
          <CardContent className="pt-0 flex flex-col gap-4">
            <Input
              label="Estimated duration (minutes)"
              type="number"
              min="5"
              max="480"
              value={form.estimatedMinutes}
              onChange={(e) => set('estimatedMinutes', e.target.value)}
              hint="Used for time compression calculations. Estimate how long this would take in a real meeting."
            />
            <Input
              label="Notification URL (optional)"
              placeholder="https://... — called when council completes with synthesis"
              value={form.webhookUrl}
              onChange={(e) => set('webhookUrl', e.target.value)}
              hint="Webhook called when a synthesis is complete. Useful for async twin meetings."
            />
          </CardContent>
        </Card>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-[#E8E8F0]">Review</h2></CardHeader>
            <CardContent className="pt-0 flex flex-col gap-4">
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#8B90B8]">Title</span>
                  <span className="text-[#E8E8F0] font-medium">{form.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B90B8]">Mode</span>
                  <Badge variant="secondary">{form.mode}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B90B8]">Type</span>
                  <Badge variant="default">{form.meetingType}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B90B8]">Duration est.</span>
                  <span className="text-[#E8E8F0]">{form.estimatedMinutes} min</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#1E2240]">
                <p className="text-xs text-[#8B90B8] mb-2">Topic</p>
                <p className="text-sm text-[#E8E8F0] leading-relaxed">{form.topic}</p>
              </div>

              <div className="pt-3 border-t border-[#1E2240]">
                <p className="text-xs text-[#8B90B8] mb-3">
                  Participants ({selectedAgents.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedAgents.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5">
                      <AgentAvatar name={a.name} size="xs" isTwin={!!a.twin_of} />
                      <span className="font-mono text-xs" style={{ color: agentColor(a.name) }}>
                        {a.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button variant="ghost" onClick={back} disabled={step === 1} size="sm">
          <ArrowLeft size={14} />
          Back
        </Button>

        {step < 5 ? (
          <Button variant="default" onClick={next} size="sm">
            Next
            <ArrowRight size={14} />
          </Button>
        ) : (
          <Button
            variant="default"
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
          >
            Create Council
          </Button>
        )}
      </div>
    </div>
  );
}

export default function NewCouncilPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <NewCouncilContent />
    </QueryClientProvider>
  );
}
