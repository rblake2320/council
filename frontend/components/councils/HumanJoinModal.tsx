"use client";

/**
 * HumanJoinModal — humans join a council as first-class participants.
 *
 * When a human opens a council debate, they can join as themselves —
 * not through their twin, but directly. Their messages appear in the
 * debate stream alongside AI agents, colored distinctly and attributed
 * with their name.
 *
 * They can also choose to:
 * - Participate (post messages, be listed in roster)
 * - Observe (read-only, listed as observer)
 * - Take over their twin (override the twin's auto-respond)
 */

import { useState } from "react";

interface HumanJoinModalProps {
  councilId: string;
  councilTitle: string;
  hasTwin?: boolean;   // does this council have a twin agent for this human?
  onJoin: (displayName: string, role: "participant" | "observer", overrideTwin: boolean) => void;
  onClose: () => void;
}

const ROLE_OPTIONS = [
  {
    value: "participant" as const,
    label: "Participate",
    description: "Post messages and be listed in the debate roster. Your messages appear alongside the AI agents.",
    icon: "💬",
  },
  {
    value: "observer" as const,
    label: "Observe",
    description: "Watch the debate in real-time without posting. Listed as an observer.",
    icon: "👁️",
  },
];

export function HumanJoinModal({ councilId, councilTitle, hasTwin, onJoin, onClose }: HumanJoinModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"participant" | "observer">("participant");
  const [overrideTwin, setOverrideTwin] = useState(false);
  const [error, setError] = useState("");

  function handleJoin() {
    const name = displayName.trim();
    if (!name) {
      setError("Display name is required.");
      return;
    }
    if (name.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    onJoin(name, role, overrideTwin);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 12,
          padding: 28,
          width: 440,
          maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          animation: "fade-in 0.15s ease",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            Join the Debate
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            You're joining <strong style={{ color: "var(--text-primary)" }}>{councilTitle}</strong> as a human participant.
            Your messages will appear alongside AI agents in the debate stream.
          </p>
        </div>

        {/* Display name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
            Your name in this debate
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setError(""); }}
            placeholder="e.g. Ron"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg-surface)",
              border: error ? "1px solid var(--state-no)" : "1px solid var(--border-subtle)",
              borderRadius: 6,
              color: "var(--text-primary)",
              fontSize: 14,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          {error && (
            <p style={{ fontSize: 11, color: "var(--state-no)", marginTop: 4 }}>{error}</p>
          )}
        </div>

        {/* Role selection */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>
            Your role
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRole(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  background: role === opt.value ? "var(--accent-glow)" : "var(--bg-surface)",
                  border: role === opt.value ? "1px solid var(--accent-border)" : "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{opt.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: role === opt.value ? "var(--accent-primary)" : "var(--text-primary)", marginBottom: 2 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {opt.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Twin override option — only shown if a twin exists */}
        {hasTwin && (
          <div
            style={{
              marginBottom: 20,
              padding: "10px 12px",
              background: overrideTwin ? "rgba(245, 166, 35, 0.08)" : "var(--bg-surface)",
              border: overrideTwin ? "1px solid rgba(245, 166, 35, 0.3)" : "1px solid var(--border-subtle)",
              borderRadius: 8,
            }}
          >
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={overrideTwin}
                onChange={(e) => setOverrideTwin(e.target.checked)}
                style={{ marginTop: 2, accentColor: "var(--state-changed)" }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--state-changed)", marginBottom: 2 }}>
                  Take over from your digital twin
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  Your twin will stop auto-responding. You speak directly.
                  You can hand back to your twin any time.
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            style={{
              padding: "8px 20px",
              background: "var(--accent-primary)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            Join Debate
          </button>
        </div>
      </div>
    </div>
  );
}
