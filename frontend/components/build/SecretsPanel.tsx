import * as React from 'react';
import {
  X,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';

interface Secret {
  id: string;
  key: string;
  value: string;
  visible: boolean;
}

interface SecretsPanelProps {
  councilId: string;
  onSecretsChange: (secrets: Record<string, string>) => void;
  isOpen: boolean;
  onClose: () => void;
}

const LS_KEY = (id: string) => `council_secrets_${id}`;

// Helper to build the injection script from secrets
export function buildSecretsScript(secrets: Record<string, string>): string {
  const json = JSON.stringify(secrets);
  return `<script>window.ENV = ${json};</script>`;
}

export function SecretsPanel({
  councilId,
  onSecretsChange,
  isOpen,
  onClose,
}: SecretsPanelProps) {
  const [secrets, setSecrets] = React.useState<Secret[]>([]);
  const [exampleExpanded, setExampleExpanded] = React.useState(false);
  const backdropRef = React.useRef<HTMLDivElement>(null);

  // Load from localStorage on mount
  React.useEffect(() => {
    const stored = localStorage.getItem(LS_KEY(councilId));
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, string>;
        const secretsArray = Object.entries(parsed).map(([key, value]) => ({
          id: `secret-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          key,
          value,
          visible: false,
        }));
        setSecrets(secretsArray);
      } catch (e) {
        // Silent fail on malformed JSON
        console.warn('Failed to parse stored secrets', e);
      }
    }
  }, [councilId]);

  // Save to localStorage and notify parent whenever secrets change
  const persistSecrets = React.useCallback(
    (newSecrets: Secret[]) => {
      // Build clean record: skip empty keys
      const record: Record<string, string> = {};
      newSecrets.forEach((secret) => {
        if (secret.key.trim()) {
          record[secret.key] = secret.value;
        }
      });

      // Save to localStorage
      localStorage.setItem(LS_KEY(councilId), JSON.stringify(record));

      // Notify parent
      onSecretsChange(record);
    },
    [councilId, onSecretsChange]
  );

  const handleKeyChange = (id: string, newKey: string) => {
    const upperKey = newKey.toUpperCase();
    const updated = secrets.map((s) =>
      s.id === id ? { ...s, key: upperKey } : s
    );
    setSecrets(updated);
    persistSecrets(updated);
  };

  const handleValueChange = (id: string, newValue: string) => {
    const updated = secrets.map((s) =>
      s.id === id ? { ...s, value: newValue } : s
    );
    setSecrets(updated);
    persistSecrets(updated);
  };

  const handleToggleVisibility = (id: string) => {
    const updated = secrets.map((s) =>
      s.id === id ? { ...s, visible: !s.visible } : s
    );
    setSecrets(updated);
  };

  const handleDelete = (id: string) => {
    const updated = secrets.filter((s) => s.id !== id);
    setSecrets(updated);
    persistSecrets(updated);
  };

  const handleAddSecret = () => {
    const newSecret: Secret = {
      id: `secret-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      key: '',
      value: '',
      visible: false,
    };
    setSecrets([...secrets, newSecret]);

    // Auto-focus the new key input on next render
    setTimeout(() => {
      const lastKeyInput = document.querySelector(
        `input[data-secret-id="${newSecret.id}"][data-field="key"]`
      ) as HTMLInputElement;
      if (lastKeyInput) {
        lastKeyInput.focus();
      }
    }, 0);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className="fixed inset-0 bg-black/50 z-40"
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-80 bg-[#111320] border-l border-[#1E2240] shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#0d0f1d] border-b border-[#1E2240] px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-[#7C6BF2]" />
            <h2 className="text-sm font-semibold text-[#E8E8F0]">
              Secrets & Env Vars
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#8B90B8] hover:text-[#E8E8F0] transition-colors p-1"
            aria-label="Close secrets panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Explainer */}
          <p className="text-xs text-[#8B90B8] leading-relaxed">
            Secrets are injected as <code className="bg-[#0d0f1d] px-1 rounded text-[#7C6BF2]">window.ENV</code> in your preview. Never commit secrets to code.
          </p>

          {/* Secrets list */}
          <div className="space-y-2">
            {secrets.length === 0 ? (
              <p className="text-xs text-[#4A5070] italic">
                No secrets yet. Add one to get started.
              </p>
            ) : (
              secrets.map((secret) => (
                <div
                  key={secret.id}
                  className="flex items-center gap-2 bg-[#0d0f1d] rounded border border-[#1E2240] p-2"
                >
                  {/* Key input */}
                  <input
                    type="text"
                    placeholder="KEY"
                    value={secret.key}
                    onChange={(e) => handleKeyChange(secret.id, e.target.value)}
                    data-secret-id={secret.id}
                    data-field="key"
                    className="bg-[#0d0f1d] border border-[#1E2240] rounded px-2 py-1 text-xs font-mono text-[#E8E8F0] w-[120px] focus:border-[#7C6BF2] focus:outline-none focus:ring-1 focus:ring-[#7C6BF2]/30 transition-colors"
                  />

                  {/* Separator */}
                  <span className="text-[#4A5070] text-xs font-mono">=</span>

                  {/* Value input */}
                  <input
                    type={secret.visible ? 'text' : 'password'}
                    placeholder="value"
                    value={secret.value}
                    onChange={(e) => handleValueChange(secret.id, e.target.value)}
                    className="bg-[#0d0f1d] border border-[#1E2240] rounded px-2 py-1 text-xs font-mono text-[#E8E8F0] flex-1 focus:border-[#7C6BF2] focus:outline-none focus:ring-1 focus:ring-[#7C6BF2]/30 transition-colors"
                  />

                  {/* Toggle visibility */}
                  <button
                    onClick={() => handleToggleVisibility(secret.id)}
                    className="text-[#8B90B8] hover:text-[#E8E8F0] transition-colors p-1 flex-shrink-0"
                    aria-label={
                      secret.visible ? 'Hide secret' : 'Show secret'
                    }
                  >
                    {secret.visible ? (
                      <Eye size={16} />
                    ) : (
                      <EyeOff size={16} />
                    )}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(secret.id)}
                    className="text-[#8B90B8] hover:text-[#F05A5A] transition-colors p-1 flex-shrink-0"
                    aria-label="Delete secret"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add button */}
          <button
            onClick={handleAddSecret}
            className="flex items-center gap-2 text-[#7C6BF2] hover:bg-[#1E2240] rounded px-2 py-1.5 text-xs font-medium transition-colors w-full justify-center"
          >
            <Plus size={14} />
            Add Secret
          </button>

          {/* Usage example (collapsible) */}
          <div className="border border-[#1E2240] rounded pt-2 mt-4">
            <button
              onClick={() => setExampleExpanded(!exampleExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[#8B90B8] hover:text-[#E8E8F0] transition-colors"
            >
              <span>Usage Example</span>
              {exampleExpanded ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>

            {exampleExpanded && (
              <div className="px-3 pb-3 border-t border-[#1E2240]">
                <pre className="bg-[#0d0f1d] rounded p-2 text-xs font-mono text-[#7C6BF2] overflow-x-auto">
                  {`// In your code:
const apiKey = window.ENV?.MY_API_KEY;
const dbUrl = window.ENV?.DATABASE_URL;

fetch(url, {
  headers: {
    'Authorization': \`Bearer \${apiKey}\`
  }
})`}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#0d0f1d] border-t border-[#1E2240] px-4 py-3 flex-shrink-0">
          <p className="text-xs text-[#4A5070]">
            Secrets live in localStorage only. Never leave this machine.
          </p>
        </div>
      </div>
    </>
  );
}
