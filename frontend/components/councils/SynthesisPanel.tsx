'use client';

import * as React from 'react';
import { cn, agentColor, positionColor, positionLabel } from '@/lib/utils';
import type { AgentPosition, AgentRuntimeState, Council, Synthesis } from '@/lib/types';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, AlertTriangle, CheckCircle } from 'lucide-react';

interface SynthesisPanelProps {
  council: Council;
  synthesis: Synthesis | null;
  agentStates: Record<string, AgentRuntimeState>;
  onRunSynthesis?: () => void;
  synthesizing?: boolean;
}

function calculateAgreementLevel(
  agentStates: Record<string, AgentRuntimeState>,
  synthesis: Synthesis | null,
): number {
  if (synthesis?.votes) {
    const { yes = 0, no = 0, abstain = 0 } = synthesis.votes as {
      yes?: number;
      no?: number;
      abstain?: number;
    };
    const total = yes + no + abstain;
    if (total === 0) return 0;
    const majority = Math.max(yes, no);
    return Math.round((majority / total) * 100);
  }

  // Live calculation from agent states
  const positions = Object.values(agentStates)
    .map((s) => s.currentPosition)
    .filter(Boolean) as AgentPosition[];

  if (positions.length === 0) return 0;
  const counts: Record<string, number> = {};
  for (const p of positions) {
    if (p) counts[p] = (counts[p] ?? 0) + 1;
  }
  const max = Math.max(...Object.values(counts));
  return Math.round((max / positions.length) * 100);
}

interface Disagreement {
  agentA: string;
  agentB: string;
  positionA: AgentPosition;
  positionB: AgentPosition;
}

function findDisagreements(agentStates: Record<string, AgentRuntimeState>): Disagreement[] {
  const entries = Object.entries(agentStates).filter(
    ([, s]) => s.currentPosition && s.currentPosition !== 'ABSTAIN',
  );

  const disagreements: Disagreement[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [, a] = entries[i];
      const [, b] = entries[j];
      if (a.currentPosition !== b.currentPosition) {
        disagreements.push({
          agentA: a.agentId,
          agentB: b.agentId,
          positionA: a.currentPosition,
          positionB: b.currentPosition,
        });
      }
    }
  }
  return disagreements.slice(0, 4); // cap at 4 for UI
}

export function SynthesisPanel({
  council,
  synthesis,
  agentStates,
  onRunSynthesis,
  synthesizing,
}: SynthesisPanelProps) {
  const agreementLevel = calculateAgreementLevel(agentStates, synthesis);
  const disagreements = findDisagreements(agentStates);

  // Build id → name map from participants
  const nameMap = new Map(council.participants.map((p) => [p.agent_id, p.name]));

  const agentStateList = Object.values(agentStates);

  // Time compression estimate: real hours → council minutes
  const createdAt = new Date(council.created_at).getTime();
  const runningMin = Math.round((Date.now() - createdAt) / 60_000);
  const estimatedRealHours = Math.max(1, Math.round(council.participants.length * 0.75));
  const compressionX = runningMin > 0 ? Math.round((estimatedRealHours * 60) / runningMin) : 1;

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {/* Agreement meter */}
      <div className="bg-[#111320] rounded-lg border border-[#1E2240] p-4">
        <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-3">
          Agreement Level
        </h3>
        <Progress
          value={agreementLevel}
          color={
            agreementLevel >= 70
              ? 'var(--state-yes)'
              : agreementLevel >= 40
              ? 'var(--state-changed)'
              : 'var(--state-no)'
          }
          showValue
        />
        <p className="text-[10px] text-[#4A5070] mt-2">
          {disagreements.length} open disagreement{disagreements.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Agent positions summary */}
      <div className="bg-[#111320] rounded-lg border border-[#1E2240] p-4">
        <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-3">
          Agent Positions
        </h3>
        <div className="flex flex-col gap-2">
          {agentStateList.length === 0 ? (
            <p className="text-xs text-[#4A5070]">No positions yet</p>
          ) : (
            agentStateList.map((state) => {
              const agentName = nameMap.get(state.agentId) ?? state.agentId;
              const color = agentColor(agentName);
              return (
                <div key={state.agentId} className="flex items-center gap-2 justify-between">
                  <span
                    className="font-mono text-xs truncate"
                    style={{ color }}
                  >
                    {agentName}
                  </span>
                  {state.currentPosition ? (
                    <span
                      className="text-xs font-mono font-bold shrink-0"
                      style={{ color: positionColor(state.currentPosition) }}
                    >
                      {positionLabel(state.currentPosition)}
                    </span>
                  ) : (
                    <span className="text-xs text-[#4A5070]">—</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Active disagreements */}
      {disagreements.length > 0 && (
        <div className="bg-[#111320] rounded-lg border border-[#1E2240] p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle size={12} className="text-[#F5A623]" />
            <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider">
              Active Disagreements
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            {disagreements.map((d, i) => {
              const nameA = nameMap.get(d.agentA) ?? d.agentA;
              const nameB = nameMap.get(d.agentB) ?? d.agentB;
              return (
                <div key={i} className="flex items-center gap-1 text-[10px] font-mono flex-wrap">
                  <span style={{ color: agentColor(nameA) }}>{nameA}</span>
                  <span
                    className="font-bold shrink-0"
                    style={{ color: positionColor(d.positionA) }}
                  >
                    ({positionLabel(d.positionA)})
                  </span>
                  <span className="text-[#4A5070]">vs</span>
                  <span style={{ color: agentColor(nameB) }}>{nameB}</span>
                  <span
                    className="font-bold shrink-0"
                    style={{ color: positionColor(d.positionB) }}
                  >
                    ({positionLabel(d.positionB)})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Provisional verdict */}
      {synthesis && (
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: 'rgba(34,211,135,0.3)',
            background: 'rgba(34,211,135,0.05)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-3">
            <CheckCircle size={12} className="text-[#22D387]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#22D387' }}>
              Provisional Verdict
            </h3>
          </div>

          {/* Vote tally */}
          <div className="flex gap-3 mb-3">
            {([
              ['YES', synthesis.votes?.yes ?? 0, 'var(--state-yes)'],
              ['NO', synthesis.votes?.no ?? 0, 'var(--state-no)'],
              ['ABSTAIN', synthesis.votes?.abstain ?? 0, 'var(--text-muted)'],
            ] as [string, number, string][]).map(([label, count, color]) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-lg font-bold font-mono" style={{ color }}>
                  {count}
                </span>
                <span className="text-[10px]" style={{ color }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {synthesis.recommendations && (
            <p className="text-xs text-[#E8E8F0] leading-relaxed">
              {synthesis.recommendations.slice(0, 120)}
              {synthesis.recommendations.length > 120 && '...'}
            </p>
          )}
        </div>
      )}

      {/* Time compression */}
      <div className="bg-[#111320] rounded-lg border border-[#1E2240] p-4">
        <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-2">
          Time Compression
        </h3>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold" style={{ color: 'var(--accent-primary)' }}>
            {compressionX}x
          </span>
          <span className="text-xs text-[#4A5070]">faster than live meeting</span>
        </div>
        <p className="text-[10px] text-[#4A5070] mt-1">
          Est. {estimatedRealHours}hr meeting → {runningMin}min
        </p>
      </div>

      {/* Run synthesis button */}
      <Button
        variant="default"
        className="w-full gap-2"
        onClick={onRunSynthesis}
        loading={synthesizing}
        disabled={council.status === 'completed' || council.status === 'archived'}
      >
        <Sparkles size={14} />
        Run Synthesis
      </Button>
    </div>
  );
}
