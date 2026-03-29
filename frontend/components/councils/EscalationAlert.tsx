"use client";

/**
 * EscalationAlert — shown when a digital twin needs human input.
 *
 * The twin hit a decision outside its authorization scope. The debate
 * is paused for this agent. The human has timeout_seconds to respond.
 * If they don't, the twin abstains and the debate continues.
 *
 * This is the "30-second human input" moment that makes twin meetings work.
 */

import { useState, useEffect } from "react";
import { respondToEscalation, TwinEscalation } from "@/lib/api";

interface EscalationAlertProps {
  councilId: string;
  escalation: TwinEscalation;
  agentName: string;
  onResolved: () => void;
}

export function EscalationAlert({ councilId, escalation, agentName, onResolved }: EscalationAlertProps) {
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(escalation.timeout_seconds);

  // Countdown timer
  useEffect(() => {
    const escalatedAt = new Date(escalation.escalated_at).getTime();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - escalatedAt) / 1000);
      const remaining = escalation.timeout_seconds - elapsed;
      if (remaining <= 0) {
        clearInterval(interval);
        setTimeLeft(0);
        onResolved(); // timed out — debate continues without input
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [escalation, onResolved]);

  async function handleRespond() {
    if (!instruction.trim()) {
      setError("Please provide an instruction for your twin.");
      return;
    }
    setSubmitting(true);
    try {
      await respondToEscalation(councilId, escalation.id, instruction.trim());
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send instruction.");
      setSubmitting(false);
    }
  }

  function handleAbstain() {
    // Human explicitly says "let it abstain"
    respondToEscalation(councilId, escalation.id, "[ABSTAIN] Human chose to abstain.")
      .then(onResolved)
      .catch(() => onResolved());
  }

  const urgentColor = timeLeft < 30 ? "var(--state-no)" : timeLeft < 60 ? "var(--state-changed)" : "var(--state-thinking)";
  const timerPercent = (timeLeft / escalation.timeout_seconds) * 100;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: 380,
        background: "var(--bg-elevated)",
        border: `1px solid ${urgentColor}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${urgentColor}33`,
        zIndex: 900,
        animation: "slide-in-right 0.2s ease",
      }}
    >
      {/* Timer bar */}
      <div
        style={{
          height: 3,
          background: "var(--bg-surface)",
          borderRadius: 2,
          marginBottom: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${timerPercent}%`,
            background: urgentColor,
            borderRadius: 2,
            transition: "width 1s linear, background 0.3s ease",
          }}
        />
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: urgentColor, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Your Twin Needs Input
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{agentName}</span> hit a decision it can't make alone
          </div>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: urgentColor,
            fontFamily: "JetBrains Mono, monospace",
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          {timeLeft}s
        </div>
      </div>

      {/* What the twin needs input on */}
      <div
        style={{
          padding: "10px 12px",
          background: "var(--bg-surface)",
          borderRadius: 6,
          marginBottom: 12,
          borderLeft: `3px solid ${urgentColor}`,
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Decision needed:</div>
        <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5 }}>
          {escalation.escalation_reason}
        </div>
      </div>

      {/* Twin's tentative response */}
      {escalation.twin_tentative_response && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(91, 188, 247, 0.05)",
            border: "1px solid rgba(91, 188, 247, 0.2)",
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--state-thinking)", marginBottom: 4 }}>Twin was going to say:</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, fontStyle: "italic" }}>
            "{escalation.twin_tentative_response}"
          </div>
        </div>
      )}

      {/* Human instruction input */}
      <textarea
        value={instruction}
        onChange={(e) => { setInstruction(e.target.value); setError(""); }}
        placeholder="Tell your twin what to say or do... (or click Abstain to skip)"
        rows={3}
        style={{
          width: "100%",
          padding: "9px 12px",
          background: "var(--bg-surface)",
          border: error ? "1px solid var(--state-no)" : "1px solid var(--border-subtle)",
          borderRadius: 6,
          color: "var(--text-primary)",
          fontSize: 12,
          fontFamily: "inherit",
          resize: "none",
          lineHeight: 1.5,
          outline: "none",
          marginBottom: error ? 6 : 12,
        }}
      />
      {error && (
        <p style={{ fontSize: 11, color: "var(--state-no)", marginBottom: 10 }}>{error}</p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleAbstain}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Abstain
        </button>
        <button
          onClick={handleRespond}
          disabled={submitting}
          style={{
            flex: 2,
            padding: "8px 12px",
            background: urgentColor,
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: submitting ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "inherit",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Sending..." : "Send to Twin →"}
        </button>
      </div>
    </div>
  );
}
