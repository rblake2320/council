import * as React from 'react';
import { agentColor, positionColor } from '@/lib/utils';
import type { AgentPosition, Message } from '@/lib/types';

interface RoundPosition {
  round: number;
  position: AgentPosition;
  changed: boolean;
}

interface AgentTimeline {
  agentId: string;
  agentName: string;
  rounds: RoundPosition[];
}

interface PositionRailProps {
  messages: Message[];
  participants: Array<{ agent_id: string; name: string }>;
}

function buildTimelines(
  messages: Message[],
  participants: Array<{ agent_id: string; name: string }>,
): AgentTimeline[] {
  const agentMap = new Map(participants.map((p) => [p.agent_id, p.name]));
  const timelines = new Map<string, AgentTimeline>();

  for (const msg of messages) {
    if (!msg.agent_id || !msg.metadata?.position) continue;
    const pos = msg.metadata.position as AgentPosition;
    const round = (msg.metadata.round as number | undefined) ?? 1;
    const name = msg.agent_name ?? agentMap.get(msg.agent_id) ?? 'Agent';

    if (!timelines.has(msg.agent_id)) {
      timelines.set(msg.agent_id, { agentId: msg.agent_id, agentName: name, rounds: [] });
    }

    const tl = timelines.get(msg.agent_id)!;
    const prev = tl.rounds[tl.rounds.length - 1];
    const changed = prev ? prev.position !== pos : false;

    // Only record if we don't already have this round
    if (!tl.rounds.find((r) => r.round === round)) {
      tl.rounds.push({ round, position: pos, changed });
    }
  }

  // Include all participants, even those who haven't spoken
  for (const p of participants) {
    if (!timelines.has(p.agent_id)) {
      timelines.set(p.agent_id, { agentId: p.agent_id, agentName: p.name, rounds: [] });
    }
  }

  return Array.from(timelines.values());
}

function PositionDot({ pos, changed }: { pos: AgentPosition; changed: boolean }) {
  const color = positionColor(pos);
  return (
    <div
      className="h-3 w-3 rounded-full shrink-0 transition-colors duration-200"
      title={pos ?? 'No position'}
      style={{
        background: pos ? color : 'var(--border-subtle)',
        border: changed ? `2px solid ${color}` : '1.5px solid transparent',
        outline: changed ? '1.5px solid rgba(245,166,35,0.4)' : 'none',
        outlineOffset: '1px',
      }}
    />
  );
}

export function PositionRail({ messages, participants }: PositionRailProps) {
  const timelines = buildTimelines(messages, participants);

  if (timelines.length === 0) {
    return (
      <div className="text-xs text-[#4A5070] text-center py-3">
        No positions recorded yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {timelines.map((tl) => {
        const color = agentColor(tl.agentName);
        return (
          <div key={tl.agentId} className="flex items-center gap-2">
            {/* Agent label */}
            <span
              className="font-mono text-[10px] truncate w-20 shrink-0"
              style={{ color }}
              title={tl.agentName}
            >
              {tl.agentName}
            </span>

            {/* Timeline dots */}
            <div className="flex items-center gap-1 flex-wrap">
              {tl.rounds.length === 0 ? (
                <div
                  className="h-2 w-8 rounded-full"
                  style={{ background: 'var(--border-subtle)' }}
                />
              ) : (
                tl.rounds.map((r) => (
                  <PositionDot key={r.round} pos={r.position} changed={r.changed} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
