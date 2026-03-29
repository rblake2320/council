/**
 * SSE client for Council debate streaming
 * Subscribes to /api/councils/{id}/stream via EventSource
 * Handles reconnect with exponential backoff.
 */

import type { CodePatch, Message, Synthesis, CouncilStatus } from './types';

export interface SSECallbacks {
  onMessage?: (msg: Message) => void;
  onTyping?: (agentId: string, agentName: string, isTyping: boolean) => void;
  onRoundStart?: (round: number, agentCount: number) => void;
  onSynthesis?: (synthesis: Synthesis) => void;
  onStatusChange?: (status: CouncilStatus) => void;
  /** Called whenever an agent emits a code block targeting a workspace file */
  onCodePatch?: (patch: CodePatch) => void;
  onError?: (err: Event) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface SSESubscription {
  close: () => void;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

export function subscribeToCouncil(
  councilId: string,
  callbacks: SSECallbacks,
): SSESubscription {
  let es: EventSource | null = null;
  let reconnectDelay = BASE_RECONNECT_DELAY_MS;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function buildUrl(): string {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const key = typeof window !== 'undefined'
      ? localStorage.getItem('council_api_key')
      : null;
    const qs = key ? `?key=${encodeURIComponent(key)}` : '';
    return `${apiUrl}/api/councils/${councilId}/stream${qs}`;
  }

  function connect() {
    if (stopped) return;

    es = new EventSource(buildUrl());

    es.onopen = () => {
      reconnectDelay = BASE_RECONNECT_DELAY_MS;
      callbacks.onConnected?.();
    };

    // Default message event (event type = "message")
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string);
        handleEvent(parsed.type ?? 'message', parsed.data ?? parsed);
      } catch {
        // ignore malformed frames
      }
    };

    // Named event types from server
    es.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Message;
        callbacks.onMessage?.(msg);
      } catch { /* noop */ }
    });

    es.addEventListener('typing', (event) => {
      try {
        const d = JSON.parse(event.data as string) as {
          agent_id: string;
          agent_name: string;
          is_typing: boolean;
        };
        callbacks.onTyping?.(d.agent_id, d.agent_name, d.is_typing);
      } catch { /* noop */ }
    });

    es.addEventListener('round_start', (event) => {
      try {
        const d = JSON.parse(event.data as string) as {
          round: number;
          agent_count: number;
        };
        callbacks.onRoundStart?.(d.round, d.agent_count);
      } catch { /* noop */ }
    });

    es.addEventListener('synthesis', (event) => {
      try {
        const synthesis = JSON.parse(event.data as string) as Synthesis;
        callbacks.onSynthesis?.(synthesis);
      } catch { /* noop */ }
    });

    es.addEventListener('status', (event) => {
      try {
        const d = JSON.parse(event.data as string) as { status: CouncilStatus };
        callbacks.onStatusChange?.(d.status);
      } catch { /* noop */ }
    });

    es.addEventListener('code_patch', (event) => {
      try {
        const patch = JSON.parse(event.data as string) as CodePatch;
        callbacks.onCodePatch?.(patch);
      } catch { /* noop */ }
    });

    es.onerror = (err) => {
      callbacks.onError?.(err);
      callbacks.onDisconnected?.();
      es?.close();
      es = null;

      if (!stopped) {
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
          connect();
        }, reconnectDelay);
      }
    };
  }

  function handleEvent(type: string, data: unknown) {
    switch (type) {
      case 'message':
        callbacks.onMessage?.(data as Message);
        break;
      case 'typing': {
        const d = data as { agent_id: string; agent_name: string; is_typing: boolean };
        callbacks.onTyping?.(d.agent_id, d.agent_name, d.is_typing);
        break;
      }
      case 'round_start': {
        const d = data as { round: number; agent_count: number };
        callbacks.onRoundStart?.(d.round, d.agent_count);
        break;
      }
      case 'synthesis':
        callbacks.onSynthesis?.(data as Synthesis);
        break;
      case 'status':
        callbacks.onStatusChange?.((data as { status: CouncilStatus }).status);
        break;
      case 'code_patch':
        callbacks.onCodePatch?.(data as CodePatch);
        break;
    }
  }

  connect();

  return {
    close() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      es = null;
      callbacks.onDisconnected?.();
    },
  };
}
