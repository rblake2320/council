// Council Platform — TypeScript types matching backend Pydantic schemas exactly

export interface Agent {
  id: string;
  name: string;
  role: string;
  personality: string | null;
  system_prompt: string;
  model_preference: string;
  tools_allowed: string[];
  config: Record<string, unknown>;
  is_external: boolean;
  webhook_url: string | null;
  api_key?: string | null; // Only present on create/rotate
  created_at: string;
  updated_at: string;
  // Digital twin extensions (stored in config)
  twin_of?: string | null;
  authorization_scope?: AuthorizationScope | null;
  twin_profile?: TwinProfile | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  role: string;
  personality: string | null;
  model_preference: string;
  is_external: boolean;
  created_at: string;
  // Digital twin extensions (stored in config)
  twin_of?: string | null;
}

export interface AgentMemory {
  id: string;
  agent_id: string;
  council_id: string | null;
  memory_type: string;
  content: string;
  created_at: string;
}

export interface AgentStats {
  agent_id: string;
  name: string;
  total_councils: number;
  total_messages: number;
  memory_entries: number;
}

export interface AuthorizationScope {
  level: 'read-only' | 'advisory' | 'delegated';
  domains: string[];
}

export interface TwinProfile {
  expertise: string[];
  communication_style: string;
  non_negotiables: string[];
  accuracy_score?: number;
}

export interface AgentCreate {
  name: string;
  role: string;
  personality?: string;
  system_prompt: string;
  model_preference: string;
  tools_allowed: string[];
  config: Record<string, unknown>;
  is_external: boolean;
  webhook_url?: string;
}

export interface AgentUpdate {
  name?: string;
  role?: string;
  personality?: string;
  system_prompt?: string;
  model_preference?: string;
  tools_allowed?: string[];
  config?: Record<string, unknown>;
  is_external?: boolean;
  webhook_url?: string;
}

// ── Council ────────────────────────────────────────────────────────────────

export type CouncilStatus = 'active' | 'paused' | 'completed' | 'archived';
export type CouncilMode = 'quick' | 'standard' | 'marathon';
export type MeetingType = 'internal' | 'twin-meeting' | 'mixed' | 'open';

export interface ParticipantOut {
  agent_id: string;
  name: string;
  role: string;
  model_preference: string;
  is_external: boolean;
  joined_at: string;
}

export interface CouncilSummary {
  id: string;
  title: string;
  topic: string;
  status: CouncilStatus;
  mode: CouncilMode;
  created_at: string;
  completed_at: string | null;
  message_count: number;
  participant_count: number;
}

export interface Council {
  id: string;
  title: string;
  topic: string;
  status: CouncilStatus;
  mode: CouncilMode;
  config: Record<string, unknown>;
  synthesis_id: string | null;
  created_at: string;
  completed_at: string | null;
  participants: ParticipantOut[];
  message_count: number;
}

export interface CouncilCreate {
  title: string;
  topic: string;
  mode: CouncilMode;
  agent_ids: string[];
  config: Record<string, unknown>;
}

export interface CouncilUpdate {
  title?: string;
  status?: CouncilStatus;
  config?: Record<string, unknown>;
}

// ── Message ────────────────────────────────────────────────────────────────

export type MessageRole = 'agent' | 'human' | 'system';
export type AgentPosition = 'YES' | 'NO' | 'ABSTAIN' | 'CHANGED' | null;

export interface Message {
  id: string;
  council_id: string;
  agent_id: string | null;
  agent_name: string | null;
  agent_role: string | null;
  role: MessageRole;
  content: string;
  mentions: string[];
  metadata: MessageMetadata;
  created_at: string;
}

export interface MessageMetadata {
  position?: AgentPosition;
  reply_to_id?: string;
  reply_to_agent?: string;
  previous_position?: AgentPosition;
  confidence?: number;
  round?: number;
  [key: string]: unknown;
}

export interface MessageCreate {
  content: string;
  role: 'human' | 'system';
  mentions?: string[];
  metadata?: Record<string, unknown>;
}

// ── Synthesis ──────────────────────────────────────────────────────────────

export interface Synthesis {
  id: string;
  council_id: string;
  consensus: string | null;
  dissent: string | null;
  insights: string | null;
  recommendations: string | null;
  votes: VoteTally;
  model_used: string | null;
  message_count: number | null;
  created_at: string;
}

export interface VoteTally {
  yes?: number;
  no?: number;
  abstain?: number;
  per_agent?: Record<string, { position: AgentPosition; rationale?: string }>;
  [key: string]: unknown;
}

// ── API Keys ───────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: Record<string, boolean>;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface ApiKeyCreated extends ApiKey {
  api_key: string;
}

export interface ApiKeyCreate {
  name: string;
  permissions: Record<string, boolean>;
  expires_at?: string;
}

// ── Webhook ────────────────────────────────────────────────────────────────

export interface Webhook {
  id: string;
  council_id: string | null;
  agent_id: string | null;
  url: string;
  events: string[];
  created_at: string;
}

export interface WebhookCreate {
  url: string;
  events: string[];
  secret?: string;
}

// ── SSE Events ────────────────────────────────────────────────────────────

export interface SSEMessageEvent {
  type: 'message';
  data: Message;
}

export interface SSETypingEvent {
  type: 'typing';
  data: {
    agent_id: string;
    agent_name: string;
    is_typing: boolean;
  };
}

export interface SSERoundStartEvent {
  type: 'round_start';
  data: {
    round: number;
    agent_count: number;
  };
}

export interface SSESynthesisEvent {
  type: 'synthesis';
  data: Synthesis;
}

export interface SSEStatusEvent {
  type: 'status';
  data: {
    status: CouncilStatus;
  };
}

// ── Code patch (agent → workspace) ────────────────────────────────────────

export interface CodePatch {
  /** Agent that proposed the patch */
  agent_name: string;
  /** Target filename (e.g. "index.html", "style.css") */
  filename: string;
  /** Canonical language tag: html | css | js | ts | jsx | tsx */
  language: string;
  /** Full replacement content for the file */
  content: string;
  /** ID of the parent message this patch came from */
  message_id: string;
}

export interface SSECodePatchEvent {
  type: 'code_patch';
  data: CodePatch;
}

/** A pending patch waiting for the human to accept or reject */
export interface PendingPatch extends CodePatch {
  /** Client-assigned unique key for this notification card */
  patch_id: string;
  /** Unix ms timestamp when patch was received */
  received_at: number;
}

/** A patch that has been applied to the workspace */
export interface AppliedPatch extends CodePatch {
  patch_id: string;
  applied_at: number;
}

export type SSEEvent =
  | SSEMessageEvent
  | SSETypingEvent
  | SSERoundStartEvent
  | SSESynthesisEvent
  | SSEStatusEvent
  | SSECodePatchEvent;

// ── Health ─────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  db: 'ok' | 'error';
  redis?: 'ok' | 'error' | 'unavailable';
  version?: string;
  uptime_seconds?: number;
}

// ── Agent runtime state (client-only) ─────────────────────────────────────

export type AgentStatus = 'idle' | 'thinking' | 'speaking';

export interface AgentRuntimeState {
  agentId: string;
  status: AgentStatus;
  currentPosition: AgentPosition;
  previousPosition?: AgentPosition;
  positionChangedAt?: number; // timestamp for flash animation
  messageCount: number;
  confidence?: number; // 0–1
  lastSpoke?: string;
}

// ── Pagination wrapper ─────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

// ── Generic API envelope ───────────────────────────────────────────────────

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
