/**
 * Council API client
 * Base URL: NEXT_PUBLIC_API_URL (default: http://localhost:8600)
 * Auth: X-Council-Key header from localStorage
 */

import type {
  Agent,
  AgentCreate,
  AgentMemory,
  AgentStats,
  AgentSummary,
  AgentUpdate,
  ApiKey,
  ApiKeyCreate,
  ApiKeyCreated,
  Council,
  CouncilCreate,
  CouncilSummary,
  CouncilUpdate,
  HealthStatus,
  Message,
  MessageCreate,
  Synthesis,
  Webhook,
  WebhookCreate,
} from './types';

// ── Error type ────────────────────────────────────────────────────────────

export class APIError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// ── Client core ───────────────────────────────────────────────────────────

function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8600';
  }
  // In the browser, route through Next.js rewrites so we stay same-origin
  return '';
}

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('council_api_key');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getBaseUrl();
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const key = getApiKey();
  if (key) {
    headers['X-Council-Key'] = key;
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    let code = `HTTP_${res.status}`;
    try {
      const body = await res.json();
      errorMessage = body?.detail ?? body?.error ?? errorMessage;
      code = body?.code ?? code;
    } catch {
      // ignore parse errors
    }
    throw new APIError(code, errorMessage, res.status);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const envelope = await res.json();

  // Backend wraps in { data, meta } — unwrap if present
  if (typeof envelope === 'object' && envelope !== null && 'data' in envelope && 'meta' in envelope) {
    return envelope.data as T;
  }

  // Legacy { success, data } envelope
  if (typeof envelope === 'object' && envelope !== null && 'success' in envelope) {
    if (!envelope.success) {
      throw new APIError(envelope.code ?? 'API_ERROR', envelope.error ?? 'Unknown error');
    }
    return envelope.data as T;
  }

  return envelope as T;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function del<T = void>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

// ── Agents ────────────────────────────────────────────────────────────────

export async function getAgents(params?: { is_external?: boolean }): Promise<AgentSummary[]> {
  const qs = params?.is_external !== undefined ? `?is_external=${params.is_external}` : '';
  const res = await get<{ agents?: AgentSummary[]; data?: AgentSummary[] } | AgentSummary[]>(`/api/agents${qs}`);
  // Handle both envelope and direct array
  if (Array.isArray(res)) return res;
  const data = (res as Record<string, unknown>).agents ?? (res as Record<string, unknown>).data;
  return Array.isArray(data) ? (data as AgentSummary[]) : [];
}

export async function createAgent(payload: AgentCreate): Promise<Agent> {
  return post<Agent>('/api/agents', payload);
}

export async function getAgent(id: string): Promise<Agent> {
  return get<Agent>(`/api/agents/${id}`);
}

export async function updateAgent(id: string, payload: AgentUpdate): Promise<Agent> {
  return put<Agent>(`/api/agents/${id}`, payload);
}

export async function deleteAgent(id: string): Promise<void> {
  return del(`/api/agents/${id}`);
}

export async function rotateAgentKey(id: string): Promise<Agent> {
  return post<Agent>(`/api/agents/${id}/rotate-key`);
}

export async function getAgentMemory(id: string): Promise<AgentMemory[]> {
  const res = await get<{ memories?: AgentMemory[] } | AgentMemory[]>(`/api/agents/${id}/memory`);
  if (Array.isArray(res)) return res;
  const data = (res as Record<string, unknown>).memories;
  return Array.isArray(data) ? (data as AgentMemory[]) : [];
}

export async function getAgentStats(id: string): Promise<AgentStats> {
  return get<AgentStats>(`/api/agents/${id}/stats`);
}

// ── Councils ──────────────────────────────────────────────────────────────

export async function getCouncils(params?: { status?: string }): Promise<CouncilSummary[]> {
  const qs = params?.status ? `?status=${params.status}` : '';
  const res = await get<{ councils?: CouncilSummary[]; data?: CouncilSummary[] } | CouncilSummary[]>(`/api/councils${qs}`);
  if (Array.isArray(res)) return res;
  const data = (res as Record<string, unknown>).councils ?? (res as Record<string, unknown>).data;
  return Array.isArray(data) ? (data as CouncilSummary[]) : [];
}

export async function createCouncil(payload: CouncilCreate): Promise<Council> {
  return post<Council>('/api/councils', payload);
}

export async function getCouncil(id: string): Promise<Council> {
  return get<Council>(`/api/councils/${id}`);
}

export async function updateCouncil(id: string, payload: CouncilUpdate): Promise<Council> {
  return put<Council>(`/api/councils/${id}`, payload);
}

export async function deleteCouncil(id: string): Promise<void> {
  return del(`/api/councils/${id}`);
}

// ── Messages ──────────────────────────────────────────────────────────────

export async function getMessages(
  councilId: string,
  params?: { limit?: number; before?: string },
): Promise<Message[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.before) qs.set('before', params.before);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await get<{ messages?: Message[]; data?: Message[] } | Message[]>(
    `/api/councils/${councilId}/messages${query}`,
  );
  if (Array.isArray(res)) return res;
  const data = (res as Record<string, unknown>).messages ?? (res as Record<string, unknown>).data;
  return Array.isArray(data) ? (data as Message[]) : [];
}

export async function postMessage(
  councilId: string,
  payload: MessageCreate,
): Promise<Message> {
  return post<Message>(`/api/councils/${councilId}/messages`, payload);
}

// ── Debate control ────────────────────────────────────────────────────────

export async function runRound(councilId: string): Promise<{ started: boolean }> {
  return post(`/api/councils/${councilId}/run-round`);
}

export async function pauseCouncil(councilId: string): Promise<Council> {
  return post(`/api/councils/${councilId}/pause`);
}

export async function resumeCouncil(councilId: string): Promise<Council> {
  return post(`/api/councils/${councilId}/resume`);
}

export async function endCouncil(councilId: string): Promise<Council> {
  return post(`/api/councils/${councilId}/end`);
}

// ── Synthesis ─────────────────────────────────────────────────────────────

export async function synthesize(councilId: string): Promise<Synthesis> {
  return post<Synthesis>(`/api/councils/${councilId}/synthesize`);
}

export async function getSynthesis(councilId: string): Promise<Synthesis> {
  return get<Synthesis>(`/api/councils/${councilId}/synthesis`);
}

// ── API Keys ──────────────────────────────────────────────────────────────

export async function getApiKeys(): Promise<ApiKey[]> {
  const res = await get<{ keys?: ApiKey[] } | ApiKey[]>('/api/keys');
  if (Array.isArray(res)) return res;
  const data = (res as Record<string, unknown>).keys;
  return Array.isArray(data) ? (data as ApiKey[]) : [];
}

export async function createApiKey(payload: ApiKeyCreate): Promise<ApiKeyCreated> {
  return post<ApiKeyCreated>('/api/keys', payload);
}

export async function revokeApiKey(id: string): Promise<void> {
  return del(`/api/keys/${id}`);
}

// ── Webhooks ──────────────────────────────────────────────────────────────

export async function getWebhooks(councilId?: string): Promise<Webhook[]> {
  const qs = councilId ? `?council_id=${councilId}` : '';
  const res = await get<{ webhooks?: Webhook[] } | Webhook[]>(`/api/councils/webhooks${qs}`);
  if (Array.isArray(res)) return res;
  const data = (res as Record<string, unknown>).webhooks;
  return Array.isArray(data) ? (data as Webhook[]) : [];
}

export async function createWebhook(
  councilId: string,
  payload: WebhookCreate,
): Promise<Webhook> {
  return post<Webhook>(`/api/councils/${councilId}/webhooks`, payload);
}

// ── Health ────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthStatus> {
  return get<HealthStatus>('/api/health');
}

// ── Human Participants ────────────────────────────────────────────────────
// Humans join councils as first-class participants alongside AI agents.

export interface HumanParticipant {
  id: string;
  council_id: string;
  display_name: string;
  identity?: string;
  council_role: 'owner' | 'participant' | 'observer';
  is_online: boolean;
  last_seen_at?: string;
  twin_agent_id?: string;
  twin_override_active: boolean;
  joined_at: string;
}

export async function getHumanParticipants(councilId: string): Promise<HumanParticipant[]> {
  return get<HumanParticipant[]>(`/api/councils/${councilId}/humans`);
}

// ── Twin Escalations ──────────────────────────────────────────────────────
// When a twin hits a decision it can't make, it escalates to the human.

export interface TwinEscalation {
  id: string;
  agent_id: string;
  status: 'pending' | 'human_responded' | 'timed_out' | 'auto_resolved';
  escalation_reason: string;
  twin_tentative_response?: string;
  timeout_seconds: number;
  escalated_at: string;
  resolved_at?: string;
}

export async function getEscalations(
  councilId: string,
  statusFilter?: string,
): Promise<TwinEscalation[]> {
  const qs = statusFilter ? `?status_filter=${statusFilter}` : '';
  return get<TwinEscalation[]>(`/api/councils/${councilId}/escalations${qs}`);
}

export async function respondToEscalation(
  councilId: string,
  escalationId: string,
  humanInstruction: string,
): Promise<{ status: string; message: string }> {
  return post(`/api/councils/${councilId}/escalations/${escalationId}/respond`, {
    human_instruction: humanInstruction,
  });
}

// ── Notification Channels ─────────────────────────────────────────────────
// Where to reach a human when their twin needs them: SMS, email, webhook, etc.

export interface NotificationChannel {
  id: string;
  identity: string;
  display_name: string;
  channel_type: 'sms' | 'email' | 'webhook' | 'push' | 'slack' | 'discord';
  destination: string;
  notify_on: string[];
  is_active: boolean;
  last_notified_at?: string;
  created_at: string;
}

export interface NotificationChannelCreate {
  identity: string;
  display_name: string;
  channel_type: string;
  destination: string;
  config?: Record<string, unknown>;
  notify_on?: string[];
}

export async function getNotificationChannels(
  identity: string,
): Promise<NotificationChannel[]> {
  return get<NotificationChannel[]>(
    `/api/notifications/channels?identity=${encodeURIComponent(identity)}`,
  );
}

export async function createNotificationChannel(
  payload: NotificationChannelCreate,
): Promise<NotificationChannel> {
  return post<NotificationChannel>('/api/notifications/channels', payload);
}

export async function deleteNotificationChannel(id: string): Promise<void> {
  return del(`/api/notifications/channels/${id}`);
}

export async function testNotification(identity: string): Promise<{ results: unknown[] }> {
  return post(`/api/notifications/test?identity=${encodeURIComponent(identity)}`, {});
}

// ── External Agent Participation ──────────────────────────────────────────
// AI agents from outside can join open councils via API key.
// This is the agent-friendly entrypoint — same pattern as OpenAI Assistants API.

export async function participateInCouncil(
  councilId: string,
  agentData: {
    agent_name: string;
    role: string;
    system_prompt: string;
    model?: string;
    webhook_url?: string;
  },
): Promise<{ agent_id: string; session_token: string }> {
  return post(`/api/councils/${councilId}/participate`, agentData);
}
