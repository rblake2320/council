import * as React from 'react';
import { cn, agentColor, positionColor, positionLabel } from '@/lib/utils';
import type { AgentPosition, Council, Synthesis } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Minus, Scale } from 'lucide-react';

interface VerdictCardProps {
  council: Council;
  synthesis: Synthesis;
  className?: string;
}

function VoteDot({ position }: { position: AgentPosition }) {
  switch (position) {
    case 'YES': return <CheckCircle size={14} style={{ color: 'var(--state-yes)' }} />;
    case 'NO': return <XCircle size={14} style={{ color: 'var(--state-no)' }} />;
    default: return <Minus size={14} style={{ color: 'var(--text-muted)' }} />;
  }
}

export function VerdictCard({ council, synthesis, className }: VerdictCardProps) {
  const votes = synthesis.votes ?? {};
  const yesCount = (votes.yes as number) ?? 0;
  const noCount = (votes.no as number) ?? 0;
  const abstainCount = (votes.abstain as number) ?? 0;
  const total = yesCount + noCount + abstainCount;

  const perAgent = (votes.per_agent ?? {}) as Record<
    string,
    { position: AgentPosition; rationale?: string }
  >;

  // Build agent name map
  const nameMap = new Map(council.participants.map((p) => [p.agent_id, p.name]));

  const majority = yesCount > noCount ? 'YES' : noCount > yesCount ? 'NO' : 'TIED';

  return (
    <div
      className={cn(
        'rounded-xl border border-[#1E2240] bg-[#111320] overflow-hidden',
        className,
      )}
    >
      {/* Header gradient banner */}
      <div
        className="px-6 py-5"
        style={{
          background: 'linear-gradient(135deg, rgba(124,107,242,0.15) 0%, rgba(91,188,247,0.05) 100%)',
          borderBottom: '1px solid #1E2240',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Scale size={16} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#8B90B8]">
            Council Verdict
          </span>
        </div>
        <h2 className="text-lg font-semibold text-[#E8E8F0] leading-snug">
          {council.topic}
        </h2>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Vote tally */}
        <div>
          <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-3">
            Vote Tally
          </h3>
          <div className="flex gap-4">
            {([
              ['YES', yesCount, 'var(--state-yes)'],
              ['NO', noCount, 'var(--state-no)'],
              ['ABSTAIN', abstainCount, 'var(--text-muted)'],
            ] as [string, number, string][]).map(([label, count, color]) => (
              <div
                key={label}
                className="flex-1 rounded-lg p-3 text-center"
                style={{
                  background: `${color}12`,
                  border: `1px solid ${color}33`,
                }}
              >
                <div className="text-2xl font-bold font-mono" style={{ color }}>
                  {count}
                </div>
                <div className="text-xs font-medium mt-0.5" style={{ color }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          {total > 0 && (
            <p className="text-xs text-[#4A5070] mt-2 text-center">
              {total} total votes •{' '}
              <span
                className="font-semibold"
                style={{ color: majority === 'YES' ? 'var(--state-yes)' : majority === 'NO' ? 'var(--state-no)' : 'var(--state-changed)' }}
              >
                {majority === 'TIED' ? 'Tied' : `${majority} wins`}
              </span>
            </p>
          )}
        </div>

        {/* Recommendation */}
        {synthesis.recommendations && (
          <div
            className="rounded-lg p-4"
            style={{
              background: 'rgba(124,107,242,0.08)',
              border: '1px solid rgba(124,107,242,0.25)',
            }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--accent-primary)' }}>
              Recommendation
            </h3>
            <p className="text-base font-medium text-[#E8E8F0] leading-relaxed">
              {synthesis.recommendations}
            </p>
          </div>
        )}

        {/* Consensus */}
        {synthesis.consensus && (
          <div>
            <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CheckCircle size={12} style={{ color: 'var(--state-yes)' }} />
              Consensus
            </h3>
            <p className="text-sm text-[#E8E8F0] leading-relaxed">{synthesis.consensus}</p>
          </div>
        )}

        {/* Dissent */}
        {synthesis.dissent && (
          <div>
            <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <XCircle size={12} style={{ color: 'var(--state-no)' }} />
              Dissent
            </h3>
            <p className="text-sm text-[#E8E8F0] leading-relaxed">{synthesis.dissent}</p>
          </div>
        )}

        {/* Key insights */}
        {synthesis.insights && (
          <div>
            <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-2">
              Key Insights
            </h3>
            <p className="text-sm text-[#8B90B8] leading-relaxed">{synthesis.insights}</p>
          </div>
        )}

        {/* Per-agent breakdown */}
        {Object.keys(perAgent).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-[#8B90B8] uppercase tracking-wider mb-3">
              Agent Stances
            </h3>
            <div className="flex flex-col gap-2">
              {Object.entries(perAgent).map(([agentId, { position, rationale }]) => {
                const name = nameMap.get(agentId) ?? agentId;
                const color = agentColor(name);
                return (
                  <div
                    key={agentId}
                    className="flex items-start gap-3 p-3 rounded-lg bg-[#0B0D14] border border-[#1E2240]"
                  >
                    <VoteDot position={position} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs font-medium" style={{ color }}>
                          {name}
                        </span>
                        <Badge
                          variant={position === 'YES' ? 'yes' : position === 'NO' ? 'no' : 'secondary'}
                          className="text-[10px] py-0 px-1.5"
                        >
                          {positionLabel(position)}
                        </Badge>
                      </div>
                      {rationale && (
                        <p className="text-xs text-[#8B90B8] leading-relaxed">{rationale}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Meta */}
        <div
          className="text-xs text-[#4A5070] pt-2 border-t border-[#1E2240] flex flex-wrap gap-3"
        >
          {synthesis.model_used && <span>Model: {synthesis.model_used}</span>}
          {synthesis.message_count && <span>{synthesis.message_count} messages analyzed</span>}
          <span>Generated {new Date(synthesis.created_at).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
