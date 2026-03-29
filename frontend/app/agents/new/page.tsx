'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createAgent } from '@/lib/api';
import { useAppStore } from '@/lib/stores';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Bot, User, Key, Copy, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

const MODEL_OPTIONS = [
  { value: 'gemma3:latest', label: 'gemma3:latest (local, fast)' },
  { value: 'llama3.1:70b', label: 'llama3.1:70b (local, capable)' },
  { value: 'deepseek-r1:32b', label: 'deepseek-r1:32b (local, reasoning)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Anthropic)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Anthropic)' },
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
];

const SCOPE_LEVELS = [
  { value: 'read-only', label: 'Read-only — observe and report, no decisions' },
  { value: 'advisory', label: 'Advisory — recommend, but human confirms' },
  { value: 'delegated', label: 'Delegated — full authority within defined domains' },
];

const DOMAIN_OPTIONS = [
  'business_strategy',
  'product_decisions',
  'technical_architecture',
  'legal_contracts',
  'financial_commitments',
  'hiring_decisions',
  'partnership_agreements',
  'public_communications',
];

interface AgentFormData {
  name: string;
  role: string;
  personality: string;
  system_prompt: string;
  model_preference: string;
  webhook_url: string;
  twin_of: string;
  scope_level: string;
  scope_domains: string[];
  expertise: string;
  communication_style: string;
  non_negotiables: string;
}

function CreatedKeyModal({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  async function copyKey() {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(11,13,20,0.85)] backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border border-[rgba(34,211,135,0.3)] bg-[#111320] p-6 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Key size={16} style={{ color: 'var(--state-yes)' }} />
          <h2 className="text-base font-semibold text-[#E8E8F0]">Agent Created</h2>
        </div>
        <p className="text-sm text-[#8B90B8] mb-4">
          Store this API key securely. It will{' '}
          <span className="text-[#F05A5A] font-medium">not be shown again</span>.
        </p>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0B0D14] border border-[#1E2240] mb-5">
          <code className="flex-1 text-xs font-mono text-[#22D387] break-all">
            {apiKey}
          </code>
          <button
            onClick={copyKey}
            className="shrink-0 p-1.5 rounded text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240]"
          >
            {copied ? <CheckCircle size={14} style={{ color: 'var(--state-yes)' }} /> : <Copy size={14} />}
          </button>
        </div>
        <Button variant="default" className="w-full" onClick={onClose}>
          Got it, close
        </Button>
      </div>
    </div>
  );
}

function NewAgentContent() {
  const router = useRouter();
  const addToast = useAppStore((s) => s.addToast);
  const [mode, setMode] = React.useState<'ai' | 'twin'>('ai');
  const [submitting, setSubmitting] = React.useState(false);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [createdId, setCreatedId] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<AgentFormData>({
    name: '',
    role: '',
    personality: '',
    system_prompt: '',
    model_preference: 'gemma3:latest',
    webhook_url: '',
    twin_of: '',
    scope_level: 'advisory',
    scope_domains: [],
    expertise: '',
    communication_style: '',
    non_negotiables: '',
  });

  const [errors, setErrors] = React.useState<Partial<Record<keyof AgentFormData, string>>>({});

  function set(field: keyof AgentFormData, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function toggleDomain(d: string) {
    setForm((f) => ({
      ...f,
      scope_domains: f.scope_domains.includes(d)
        ? f.scope_domains.filter((x) => x !== d)
        : [...f.scope_domains, d],
    }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof AgentFormData, string>> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.role.trim()) e.role = 'Role is required';
    if (!form.system_prompt.trim() || form.system_prompt.length < 10)
      e.system_prompt = 'System prompt must be at least 10 characters';
    if (mode === 'twin' && !form.twin_of.trim())
      e.twin_of = 'Twin of is required for digital twins';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    try {
      const config: Record<string, unknown> = {};
      if (mode === 'twin') {
        config.twin_of = form.twin_of;
        config.authorization_scope = {
          level: form.scope_level,
          domains: form.scope_domains,
        };
        config.twin_profile = {
          expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean),
          communication_style: form.communication_style,
          non_negotiables: form.non_negotiables
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        };
      }

      const agent = await createAgent({
        name: form.name.trim(),
        role: form.role.trim(),
        personality: form.personality.trim() || undefined,
        system_prompt: form.system_prompt.trim(),
        model_preference: form.model_preference,
        tools_allowed: [],
        config,
        is_external: false,
        webhook_url: form.webhook_url.trim() || undefined,
      });

      if (agent.api_key) {
        setCreatedKey(agent.api_key);
        setCreatedId(agent.id);
      } else {
        addToast({ type: 'success', message: `Agent "${agent.name}" created` });
        router.push(`/agents/${agent.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create agent';
      addToast({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {createdKey && (
        <CreatedKeyModal
          apiKey={createdKey}
          onClose={() => router.push(`/agents/${createdId}`)}
        />
      )}

      <div className="flex items-center gap-3 mb-8">
        <Link href="/agents">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={14} />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold text-[#E8E8F0]">New Agent</h1>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'ai' | 'twin')}>
        <TabsList className="mb-6 w-fit">
          <TabsTrigger value="ai">
            <Bot size={14} />
            AI Agent
          </TabsTrigger>
          <TabsTrigger value="twin">
            <User size={14} />
            Digital Twin
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6">
            {/* Common fields */}
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-[#E8E8F0]">Identity</h2>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Name"
                    placeholder="e.g. NOVA, Devil's Advocate, Sarah-Twin"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    error={errors.name}
                  />
                  <Input
                    label="Role"
                    placeholder="e.g. Research Analyst, Devil's Advocate"
                    value={form.role}
                    onChange={(e) => set('role', e.target.value)}
                    error={errors.role}
                  />
                </div>
                <Input
                  label="Personality (optional)"
                  placeholder="Brief personality description shown in agent card"
                  value={form.personality}
                  onChange={(e) => set('personality', e.target.value)}
                />
                <Select
                  label="Model"
                  options={MODEL_OPTIONS}
                  value={form.model_preference}
                  onChange={(v) => set('model_preference', v)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-[#E8E8F0]">Behavior</h2>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-4">
                <Textarea
                  label="System Prompt"
                  placeholder="You are... Your role in this council is to... Always..."
                  value={form.system_prompt}
                  onChange={(e) => set('system_prompt', e.target.value)}
                  error={errors.system_prompt}
                  className="min-h-[140px]"
                  hint="This is sent as the system message to the LLM in every council session."
                />
                <Input
                  label="Webhook URL (optional)"
                  placeholder="https://... — called when agent is mentioned"
                  value={form.webhook_url}
                  onChange={(e) => set('webhook_url', e.target.value)}
                />
              </CardContent>
            </Card>

            {/* Twin-specific fields */}
            <TabsContent value="twin">
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-[#E8E8F0]">Digital Twin Config</h2>
                  <p className="text-xs text-[#8B90B8] mt-1">
                    This agent will attend meetings on behalf of a human. Configure their authority carefully.
                  </p>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col gap-4">
                  <Input
                    label="Twin of (human name or email)"
                    placeholder="e.g. Ron Blake, ron@example.com"
                    value={form.twin_of}
                    onChange={(e) => set('twin_of', e.target.value)}
                    error={errors.twin_of}
                  />

                  <Select
                    label="Authorization Level"
                    options={SCOPE_LEVELS}
                    value={form.scope_level}
                    onChange={(v) => set('scope_level', v)}
                    hint="How much authority does this twin have to make decisions?"
                  />

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-[#8B90B8]">
                      Decision Domains
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DOMAIN_OPTIONS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDomain(d)}
                          className="text-xs px-2.5 py-1 rounded-md border transition-all duration-150"
                          style={{
                            background: form.scope_domains.includes(d)
                              ? 'rgba(124,107,242,0.15)'
                              : 'transparent',
                            borderColor: form.scope_domains.includes(d)
                              ? '#7C6BF2'
                              : '#1E2240',
                            color: form.scope_domains.includes(d)
                              ? '#7C6BF2'
                              : '#8B90B8',
                          }}
                        >
                          {d.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[#4A5070]">
                      Twin will only make autonomous decisions in selected domains.
                    </p>
                  </div>

                  <Input
                    label="Expertise areas (comma-separated)"
                    placeholder="e.g. AI strategy, startup finance, product design"
                    value={form.expertise}
                    onChange={(e) => set('expertise', e.target.value)}
                  />
                  <Input
                    label="Communication style"
                    placeholder="e.g. Direct and concise, data-driven, skeptical of consensus"
                    value={form.communication_style}
                    onChange={(e) => set('communication_style', e.target.value)}
                  />
                  <Textarea
                    label="Non-negotiables (one per line)"
                    placeholder={"Never agree to IP transfers\nAlways require SLAs in writing\nNo equity without board approval"}
                    value={form.non_negotiables}
                    onChange={(e) => set('non_negotiables', e.target.value)}
                    className="min-h-[90px]"
                    hint="Hard constraints the twin will never violate regardless of pressure."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <div className="flex justify-end gap-3">
              <Link href="/agents">
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button variant="default" type="submit" loading={submitting}>
                Create Agent
              </Button>
            </div>
          </div>
        </form>
      </Tabs>
    </div>
  );
}

export default function NewAgentPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <NewAgentContent />
    </QueryClientProvider>
  );
}
