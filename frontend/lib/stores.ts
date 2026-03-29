/**
 * Zustand stores for Council platform state
 * Three stores: app (global), agents, council (active debate)
 */

import { create } from 'zustand';
import type {
  Agent,
  AgentPosition,
  AgentRuntimeState,
  AgentStatus,
  AgentSummary,
  AppliedPatch,
  Council,
  CouncilStatus,
  CouncilSummary,
  HealthStatus,
  Message,
  PendingPatch,
  Synthesis,
} from './types';

// ── App store (global settings, auth, health) ─────────────────────────────

interface AppState {
  apiKey: string | null;
  health: HealthStatus | null;
  healthLoading: boolean;
  sidebarOpen: boolean;
  toasts: Toast[];
  setApiKey: (key: string | null) => void;
  setHealth: (h: HealthStatus | null) => void;
  setHealthLoading: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export const useAppStore = create<AppState>((set, get) => ({
  apiKey:
    typeof window !== 'undefined' ? localStorage.getItem('council_api_key') : null,
  health: null,
  healthLoading: false,
  sidebarOpen: false,
  toasts: [],

  setApiKey(key) {
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem('council_api_key', key);
      } else {
        localStorage.removeItem('council_api_key');
      }
    }
    set({ apiKey: key });
  },

  setHealth(h) {
    set({ health: h });
  },

  setHealthLoading(v) {
    set({ healthLoading: v });
  },

  setSidebarOpen(v) {
    set({ sidebarOpen: v });
  },

  toggleSidebar() {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }));
  },

  addToast(toast) {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const duration = toast.duration ?? 5000;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
  },

  removeToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// ── Agents store ──────────────────────────────────────────────────────────

interface AgentsState {
  agents: AgentSummary[];
  selectedAgent: Agent | null;
  loading: boolean;
  error: string | null;
  setAgents: (agents: AgentSummary[]) => void;
  setSelectedAgent: (agent: Agent | null) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  upsertAgent: (agent: AgentSummary) => void;
  removeAgent: (id: string) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  selectedAgent: null,
  loading: false,
  error: null,

  setAgents(agents) {
    set({ agents });
  },

  setSelectedAgent(agent) {
    set({ selectedAgent: agent });
  },

  setLoading(v) {
    set({ loading: v });
  },

  setError(e) {
    set({ error: e });
  },

  upsertAgent(agent) {
    set((s) => {
      const idx = s.agents.findIndex((a) => a.id === agent.id);
      if (idx >= 0) {
        const updated = [...s.agents];
        updated[idx] = agent;
        return { agents: updated };
      }
      return { agents: [agent, ...s.agents] };
    });
  },

  removeAgent(id) {
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }));
  },
}));

// ── Council store (active debate) ─────────────────────────────────────────

interface CouncilState {
  // List
  councils: CouncilSummary[];
  councilsLoading: boolean;
  councilsError: string | null;

  // Active council
  activeCouncil: Council | null;
  messages: Message[];
  messagesLoading: boolean;
  synthesis: Synthesis | null;
  councilStatus: CouncilStatus | null;

  // Real-time agent state
  agentRuntimeStates: Record<string, AgentRuntimeState>;
  typingAgents: Set<string>;
  currentRound: number;
  sseConnected: boolean;

  // Code patches
  pendingPatches: PendingPatch[];
  appliedPatches: AppliedPatch[];

  // List actions
  setCouncils: (councils: CouncilSummary[]) => void;
  setCouncilsLoading: (v: boolean) => void;
  setCouncilsError: (e: string | null) => void;
  upsertCouncilSummary: (c: CouncilSummary) => void;

  // Active council actions
  setActiveCouncil: (c: Council | null) => void;
  setMessages: (msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  setMessagesLoading: (v: boolean) => void;
  setSynthesis: (s: Synthesis | null) => void;
  setCouncilStatus: (s: CouncilStatus) => void;
  setSSEConnected: (v: boolean) => void;
  setCurrentRound: (r: number) => void;

  // Agent runtime
  setAgentTyping: (agentId: string, agentName: string, isTyping: boolean) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  setAgentPosition: (agentId: string, position: AgentPosition) => void;
  initAgentStates: (participants: Array<{ agent_id: string }>) => void;
  clearActiveCouncil: () => void;

  // Patch actions
  addPendingPatch: (patch: PendingPatch) => void;
  acceptPatch: (patchId: string) => AppliedPatch | null;
  rejectPatch: (patchId: string) => void;
}

export const useCouncilStore = create<CouncilState>((set, get) => ({
  councils: [],
  councilsLoading: false,
  councilsError: null,
  activeCouncil: null,
  messages: [],
  messagesLoading: false,
  synthesis: null,
  councilStatus: null,
  agentRuntimeStates: {},
  typingAgents: new Set(),
  currentRound: 0,
  sseConnected: false,
  pendingPatches: [],
  appliedPatches: [],

  setCouncils(councils) {
    set({ councils });
  },

  setCouncilsLoading(v) {
    set({ councilsLoading: v });
  },

  setCouncilsError(e) {
    set({ councilsError: e });
  },

  upsertCouncilSummary(c) {
    set((s) => {
      const idx = s.councils.findIndex((x) => x.id === c.id);
      if (idx >= 0) {
        const updated = [...s.councils];
        updated[idx] = c;
        return { councils: updated };
      }
      return { councils: [c, ...s.councils] };
    });
  },

  setActiveCouncil(c) {
    set({ activeCouncil: c, councilStatus: c?.status ?? null });
  },

  setMessages(msgs) {
    set({ messages: msgs });
  },

  appendMessage(msg) {
    set((s) => {
      // Deduplicate by ID
      if (s.messages.some((m) => m.id === msg.id)) return {};
      // Update agent status: mark as speaking, extract position
      const agentId = msg.agent_id;
      if (agentId) {
        const prev = s.agentRuntimeStates[agentId];
        const newPosition = (msg.metadata?.position as AgentPosition) ?? prev?.currentPosition ?? null;
        const positionChanged =
          prev?.currentPosition &&
          newPosition &&
          prev.currentPosition !== newPosition &&
          newPosition !== 'CHANGED';

        const newState: AgentRuntimeState = {
          agentId,
          status: 'speaking',
          currentPosition: newPosition,
          previousPosition: positionChanged ? prev.currentPosition : prev?.previousPosition,
          positionChangedAt: positionChanged ? Date.now() : prev?.positionChangedAt,
          messageCount: (prev?.messageCount ?? 0) + 1,
          confidence: typeof msg.metadata?.confidence === 'number'
            ? (msg.metadata.confidence as number)
            : prev?.confidence,
          lastSpoke: msg.created_at,
        };

        // Clear speaking after 3s
        setTimeout(() => {
          const current = get().agentRuntimeStates[agentId];
          if (current?.status === 'speaking') {
            set((s2) => ({
              agentRuntimeStates: {
                ...s2.agentRuntimeStates,
                [agentId]: { ...s2.agentRuntimeStates[agentId], status: 'idle' },
              },
            }));
          }
        }, 3000);

        return {
          messages: [...s.messages, msg],
          agentRuntimeStates: {
            ...s.agentRuntimeStates,
            [agentId]: newState,
          },
        };
      }

      return { messages: [...s.messages, msg] };
    });
  },

  setMessagesLoading(v) {
    set({ messagesLoading: v });
  },

  setSynthesis(s) {
    set({ synthesis: s });
  },

  setCouncilStatus(status) {
    set({ councilStatus: status });
    if (get().activeCouncil) {
      set((s) => ({
        activeCouncil: s.activeCouncil ? { ...s.activeCouncil, status } : null,
      }));
    }
  },

  setSSEConnected(v) {
    set({ sseConnected: v });
  },

  setCurrentRound(r) {
    set({ currentRound: r });
  },

  setAgentTyping(agentId, _agentName, isTyping) {
    set((s) => {
      const next = new Set(s.typingAgents);
      if (isTyping) {
        next.add(agentId);
      } else {
        next.delete(agentId);
      }
      const runtimeUpdate: AgentRuntimeState = {
        ...(s.agentRuntimeStates[agentId] ?? {
          agentId,
          status: 'idle',
          currentPosition: null,
          messageCount: 0,
        }),
        status: isTyping ? 'thinking' : 'idle',
      };
      return {
        typingAgents: next,
        agentRuntimeStates: {
          ...s.agentRuntimeStates,
          [agentId]: runtimeUpdate,
        },
      };
    });
  },

  setAgentStatus(agentId, status) {
    set((s) => ({
      agentRuntimeStates: {
        ...s.agentRuntimeStates,
        [agentId]: {
          ...(s.agentRuntimeStates[agentId] ?? {
            agentId,
            currentPosition: null,
            messageCount: 0,
          }),
          status,
        },
      },
    }));
  },

  setAgentPosition(agentId, position) {
    set((s) => {
      const prev = s.agentRuntimeStates[agentId];
      return {
        agentRuntimeStates: {
          ...s.agentRuntimeStates,
          [agentId]: {
            ...(prev ?? { agentId, status: 'idle', messageCount: 0 }),
            previousPosition: prev?.currentPosition,
            currentPosition: position,
            positionChangedAt:
              prev?.currentPosition !== position ? Date.now() : prev?.positionChangedAt,
          },
        },
      };
    });
  },

  initAgentStates(participants) {
    const states: Record<string, AgentRuntimeState> = {};
    for (const p of participants) {
      states[p.agent_id] = {
        agentId: p.agent_id,
        status: 'idle',
        currentPosition: null,
        messageCount: 0,
      };
    }
    set({ agentRuntimeStates: states });
  },

  clearActiveCouncil() {
    set({
      activeCouncil: null,
      messages: [],
      synthesis: null,
      councilStatus: null,
      agentRuntimeStates: {},
      typingAgents: new Set(),
      currentRound: 0,
      sseConnected: false,
      pendingPatches: [],
      appliedPatches: [],
    });
  },

  addPendingPatch(patch) {
    set((s) => ({
      pendingPatches: [...s.pendingPatches, patch],
    }));
  },

  acceptPatch(patchId) {
    let accepted: AppliedPatch | null = null;
    set((s) => {
      const pending = s.pendingPatches.find((p) => p.patch_id === patchId);
      if (!pending) return {};
      accepted = { ...pending, applied_at: Date.now() };
      return {
        pendingPatches: s.pendingPatches.filter((p) => p.patch_id !== patchId),
        appliedPatches: [...s.appliedPatches, accepted],
      };
    });
    return accepted;
  },

  rejectPatch(patchId) {
    set((s) => ({
      pendingPatches: s.pendingPatches.filter((p) => p.patch_id !== patchId),
    }));
  },
}));
