'use client';

import * as React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getHealth, getApiKeys, createApiKey, revokeApiKey } from '@/lib/api';
import { useAppStore } from '@/lib/stores';
import { timeAgo, formatTime } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import {
  Copy,
  CheckCircle,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Key,
  Cpu,
  Globe,
  Activity,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

// ── Masked key input ──────────────────────────────────────────────────────

function MaskedInput({ label, storageKey, hint }: { label: string; storageKey: string; hint?: string }) {
  const [show, setShow] = React.useState(false);
  const [value, setValue] = React.useState('');
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) setValue(stored);
  }, [storageKey]);

  function handleSave() {
    if (value.trim()) {
      localStorage.setItem(storageKey, value.trim());
    } else {
      localStorage.removeItem(storageKey);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[#8B90B8]">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Enter ${label}...`}
            className="w-full h-9 px-3 pr-10 text-sm rounded-md bg-[#0B0D14] border border-[#1E2240] text-[#E8E8F0] placeholder:text-[#4A5070] focus:outline-none focus:border-[#7C6BF2]"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A5070] hover:text-[#8B90B8]"
          >
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <Button variant={saved ? 'secondary' : 'outline'} size="sm" onClick={handleSave}>
          {saved ? <><CheckCircle size={13} /> Saved</> : 'Save'}
        </Button>
      </div>
      {hint && <p className="text-xs text-[#4A5070]">{hint}</p>}
    </div>
  );
}

// ── API Keys manager ──────────────────────────────────────────────────────

function ApiKeysManager() {
  const addToast = useAppStore((s) => s.addToast);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [newKeyFull, setNewKeyFull] = React.useState<string | null>(null);
  const [keyCopied, setKeyCopied] = React.useState(false);

  const { data: keys = [], isLoading, refetch } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createApiKey({
        name,
        permissions: { read: true, write: true, join_council: true },
      }),
    onSuccess: (created) => {
      setNewKeyFull(created.api_key);
      setNewKeyName('');
      refetch();
    },
    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      addToast({ type: 'success', message: 'Key revoked' });
      refetch();
    },
    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
  });

  async function copyKey(k: string) {
    await navigator.clipboard.writeText(k);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* New key created modal */}
      {newKeyFull && (
        <div className="rounded-lg border border-[rgba(34,211,135,0.3)] bg-[rgba(34,211,135,0.05)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Key size={13} style={{ color: 'var(--state-yes)' }} />
            <span className="text-sm font-medium text-[#22D387]">New API Key Created</span>
          </div>
          <p className="text-xs text-[#8B90B8] mb-3">
            Store this key securely — it will not be shown again.
          </p>
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-[#0B0D14] border border-[#1E2240] mb-3">
            <code className="flex-1 text-xs font-mono text-[#22D387] break-all">{newKeyFull}</code>
            <button onClick={() => copyKey(newKeyFull)} className="shrink-0 p-1 rounded text-[#8B90B8] hover:text-[#E8E8F0]">
              {keyCopied ? <CheckCircle size={13} style={{ color: 'var(--state-yes)' }} /> : <Copy size={13} />}
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setNewKeyFull(null)}>
            Done
          </Button>
        </div>
      )}

      {/* Create new key */}
      <div className="flex gap-2">
        <Input
          placeholder="Key name (e.g. PKA FORGE, External Agent)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newKeyName.trim()) createMutation.mutate(newKeyName);
          }}
        />
        <Button
          variant="default"
          size="sm"
          onClick={() => createMutation.mutate(newKeyName)}
          disabled={!newKeyName.trim()}
          loading={createMutation.isPending}
          className="shrink-0"
        >
          <Plus size={13} />
          Create
        </Button>
      </div>

      {/* Keys list */}
      {isLoading ? (
        <Spinner className="mx-auto" />
      ) : keys.length === 0 ? (
        <p className="text-sm text-[#4A5070] text-center py-6">No API keys yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-[#1E2240] bg-[#0B0D14]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-[#E8E8F0]">{key.name}</span>
                  <code className="text-[10px] font-mono text-[#4A5070]">{key.key_prefix}...</code>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#4A5070]">
                  <span>Created {timeAgo(key.created_at)}</span>
                  {key.last_used_at && <span>Last used {timeAgo(key.last_used_at)}</span>}
                  {key.expires_at && <span>Expires {formatTime(key.expires_at)}</span>}
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Revoke key "${key.name}"?`)) revokeMutation.mutate(key.id);
                }}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings content ──────────────────────────────────────────────────────

function SettingsContent() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 15_000,
  });

  const setApiKey = useAppStore((s) => s.setApiKey);
  const currentKey = useAppStore((s) => s.apiKey);
  const [keyInput, setKeyInput] = React.useState(currentKey ?? '');
  const [keySaved, setKeySaved] = React.useState(false);

  function saveKey() {
    setApiKey(keyInput.trim() || null);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#E8E8F0] mb-8">Settings</h1>

      <Tabs defaultValue="models">
        <TabsList className="mb-6">
          <TabsTrigger value="models"><Cpu size={13} />Models</TabsTrigger>
          <TabsTrigger value="keys"><Key size={13} />API Keys</TabsTrigger>
          <TabsTrigger value="system"><Activity size={13} />System</TabsTrigger>
        </TabsList>

        <TabsContent value="models">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-[#E8E8F0]">Council API Key</h2>
                <p className="text-xs text-[#8B90B8] mt-1">
                  Used to authenticate all requests from this browser session.
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="council_..."
                    className="flex-1 h-9 px-3 text-sm rounded-md bg-[#0B0D14] border border-[#1E2240] text-[#E8E8F0] placeholder:text-[#4A5070] focus:outline-none focus:border-[#7C6BF2] font-mono"
                  />
                  <Button variant={keySaved ? 'secondary' : 'default'} size="sm" onClick={saveKey}>
                    {keySaved ? <><CheckCircle size={13} />Saved</> : 'Save'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-[#E8E8F0]">Model Credentials</h2>
                <p className="text-xs text-[#8B90B8] mt-1">
                  Stored in browser localStorage. Never sent to Council server directly.
                </p>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-4">
                <MaskedInput
                  label="Ollama URL"
                  storageKey="council_ollama_url"
                  hint="Default: http://localhost:11434"
                />
                <MaskedInput
                  label="Anthropic API Key"
                  storageKey="council_anthropic_key"
                  hint="sk-ant-..."
                />
                <MaskedInput
                  label="OpenAI API Key"
                  storageKey="council_openai_key"
                  hint="sk-..."
                />
                <MaskedInput
                  label="NVIDIA NIM API Key"
                  storageKey="council_nvidia_key"
                  hint="nvapi-..."
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="keys">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-[#E8E8F0]">API Keys</h2>
              <p className="text-xs text-[#8B90B8] mt-1">
                Keys allow external agents and services to participate in councils.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <ApiKeysManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-[#E8E8F0]">System Health</h2>
              </CardHeader>
              <CardContent className="pt-0">
                {!health ? (
                  <Spinner />
                ) : (
                  <div className="flex flex-col gap-3">
                    {([
                      ['API Status', health.status],
                      ['Database', health.db],
                      ['Redis', health.redis ?? 'unknown'],
                    ] as [string, string][]).map(([label, status]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-sm text-[#8B90B8]">{label}</span>
                        <Badge
                          variant={
                            status === 'ok' ? 'yes'
                            : status === 'unavailable' ? 'warning'
                            : status === 'unknown' ? 'secondary'
                            : 'error'
                          }
                        >
                          {status}
                        </Badge>
                      </div>
                    ))}
                    {health.uptime_seconds !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#8B90B8]">Uptime</span>
                        <span className="text-sm text-[#E8E8F0]">
                          {Math.floor(health.uptime_seconds / 3600)}h {Math.floor((health.uptime_seconds % 3600) / 60)}m
                        </span>
                      </div>
                    )}
                    {health.version && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#8B90B8]">Version</span>
                        <span className="text-sm font-mono text-[#E8E8F0]">{health.version}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-[#E8E8F0]">About</h2>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-2 text-sm text-[#8B90B8]">
                <div className="flex justify-between">
                  <span>Platform</span>
                  <span className="text-[#E8E8F0]">Council — Collaborative AI Agent Platform</span>
                </div>
                <div className="flex justify-between">
                  <span>Frontend</span>
                  <span className="text-[#E8E8F0] font-mono">Next.js 15 + React 19</span>
                </div>
                <div className="flex justify-between">
                  <span>API</span>
                  <span className="text-[#E8E8F0] font-mono">FastAPI + PostgreSQL + Redis</span>
                </div>
                <div className="flex justify-between">
                  <span>Design</span>
                  <span className="text-[#E8E8F0]">Council Violet (#7C6BF2)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsContent />
    </QueryClientProvider>
  );
}
