'use client';

/**
 * BuildWorkspace — Replit-style code editor + live preview + console
 * embedded inside a Council session.
 *
 * Layout:
 *   [File Tree 180px] | [Editor flex-1 / Console 120px] | [Live Preview 42%]
 *
 * Monaco editor is lazy-loaded (client-only) to avoid Next.js SSR issues.
 * Files are kept in component state; localStorage persists between page refreshes.
 *
 * Console panel captures output from the sandboxed iframe via postMessage.
 * The iframe injects a console bridge script (see buildPreviewDoc in defaultFiles.ts)
 * that intercepts console.log/warn/error and window runtime errors.
 *
 * Added features:
 *   - File rename via double-click (Enter=confirm, Escape=cancel)
 *   - File upload from disk (multiple files, overwrites on name collision)
 *   - ZIP export of all files (fflate, with per-file fallback)
 *   - GitHub import modal
 *   - Template chooser modal
 *   - Secrets panel (env-var injection into preview iframe)
 */

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import type * as Monaco from 'monaco-editor';
import {
  Plus,
  Trash2,
  Play,
  Download,
  Copy,
  Check,
  FileCode,
  FileText,
  Globe,
  RefreshCw,
  Terminal,
  ChevronDown,
  ChevronUp,
  X,
  GitMerge,
  Upload,
  GitBranch,
  LayoutTemplate,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CodePatch, PendingPatch } from '@/lib/types';
import { useCouncilStore } from '@/lib/stores';
import type { WorkspaceFile } from './defaultFiles';
import { DEFAULT_FILES, buildPreviewDoc, getLanguage } from './defaultFiles';
import { GitHubImportModal } from './GitHubImportModal';
import { TemplateChooserModal } from './TemplateChooserModal';
import { SecretsPanel, buildSecretsScript } from './SecretsPanel';

// --- Lazy Monaco (client-only) ---
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full bg-[#1e1e1e]">
        <span className="text-xs text-[#606070]">Loading editor…</span>
      </div>
    ),
  },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type ConsoleLevel = 'log' | 'warn' | 'error';

interface ConsoleEntry {
  id: number;
  level: ConsoleLevel;
  text: string;
  /** milliseconds since the preview was last run */
  ts: number;
  /** wall-clock time so we can show relative timestamps */
  wallTs: number;
}

// ─── File icon ───────────────────────────────────────────────────────────────
function FileIcon({ name }: { name: string }) {
  if (name.endsWith('.html')) return <Globe size={12} className="text-[#f97316] shrink-0" />;
  if (name.endsWith('.css')) return <FileText size={12} className="text-[#6366f1] shrink-0" />;
  if (name.endsWith('.js')) return <FileCode size={12} className="text-[#eab308] shrink-0" />;
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return <FileCode size={12} className="text-[#3b82f6] shrink-0" />;
  return <FileText size={12} className="text-[#8B90B8] shrink-0" />;
}

// ─── Relative timestamp ───────────────────────────────────────────────────────
function useRelativeTick() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

function relativeTime(wallTs: number): string {
  const diffMs = Date.now() - wallTs;
  if (diffMs < 1000) return 'just now';
  if (diffMs < 60_000) return `${(diffMs / 1000).toFixed(1)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return `${Math.floor(diffMs / 3_600_000)}h ago`;
}

// ─── Local storage helpers ────────────────────────────────────────────────────
const LS_KEY = (councilId: string) => `council_build_${councilId}`;

function loadFromStorage(councilId: string): WorkspaceFile[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY(councilId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* ignore */ }
  return null;
}

function saveToStorage(councilId: string, files: WorkspaceFile[]) {
  try {
    localStorage.setItem(LS_KEY(councilId), JSON.stringify(files));
  } catch { /* ignore */ }
}

// ─── New file dialog ──────────────────────────────────────────────────────────
function NewFileModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState('newfile.html');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form
        className="bg-[#1e2030] border border-[#2a2d4a] rounded-xl p-5 w-72 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <p className="text-sm font-semibold text-[#E8E8F0] mb-3">New file</p>
        <input
          autoFocus
          className="w-full bg-[#0d0f1d] border border-[#2a2d4a] text-[#E8E8F0] text-sm rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-[#7C6BF2]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="filename.html"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 text-xs text-[#8B90B8] hover:text-[#E8E8F0] py-1.5 rounded-lg border border-[#2a2d4a] transition">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 text-xs bg-[#7C6BF2] hover:bg-[#6C5BE2] text-white py-1.5 rounded-lg transition font-semibold">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Console Panel ────────────────────────────────────────────────────────────
const MIN_CONSOLE_HEIGHT = 60;
const MAX_CONSOLE_HEIGHT = 400;
const DEFAULT_CONSOLE_HEIGHT = 120;

interface ConsolePanelProps {
  entries: ConsoleEntry[];
  height: number;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  onResize: (newHeight: number) => void;
}

function ConsolePanel({
  entries,
  height,
  open,
  onToggle,
  onClear,
  onResize,
}: ConsolePanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const dragStartY = React.useRef<number | null>(null);
  const dragStartH = React.useRef<number>(height);
  const tick = useRelativeTick();

  // Auto-scroll to bottom when new entries arrive
  React.useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, open]);

  const errorCount = entries.filter((e) => e.level === 'error').length;
  const warnCount = entries.filter((e) => e.level === 'warn').length;

  // Drag-resize handle — mousedown on the 4px top border
  function handleDragMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = height;

    function onMouseMove(ev: MouseEvent) {
      if (dragStartY.current === null) return;
      const delta = dragStartY.current - ev.clientY; // dragging up = larger
      const newH = Math.max(MIN_CONSOLE_HEIGHT, Math.min(MAX_CONSOLE_HEIGHT, dragStartH.current + delta));
      onResize(newH);
    }

    function onMouseUp() {
      dragStartY.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  return (
    <div
      className="flex flex-col shrink-0 bg-[#0a0c1a] border-t border-[#1E2240]"
      style={{ height: open ? height : 28 }}
    >
      {/* Drag handle — only visible when open */}
      {open && (
        <div
          className="h-1 w-full cursor-ns-resize bg-[#1E2240] hover:bg-[#7C6BF2] transition-colors shrink-0"
          style={{ minHeight: 4 }}
          onMouseDown={handleDragMouseDown}
          title="Drag to resize console"
        />
      )}

      {/* Console header */}
      <div className="flex items-center gap-2 px-3 shrink-0 bg-[#111320] border-b border-[#1E2240]"
        style={{ height: 28, minHeight: 28 }}>
        {/* Label + icon */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-[#8B90B8] hover:text-[#E8E8F0] transition select-none"
        >
          <Terminal size={11} className="shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Console</span>
          {open ? (
            <ChevronDown size={10} className="shrink-0" />
          ) : (
            <ChevronUp size={10} className="shrink-0" />
          )}
        </button>

        {/* Count badges */}
        {errorCount > 0 && (
          <span className="text-[9px] font-bold bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded-full leading-none">
            {errorCount} err
          </span>
        )}
        {warnCount > 0 && (
          <span className="text-[9px] font-bold bg-yellow-900/60 text-yellow-300 px-1.5 py-0.5 rounded-full leading-none">
            {warnCount} warn
          </span>
        )}

        <div className="flex-1" />

        {/* Entry count */}
        {entries.length > 0 && (
          <span className="text-[9px] text-[#4A5070] mr-1">
            {entries.length} {entries.length === 1 ? 'line' : 'lines'}
          </span>
        )}

        {/* Clear button */}
        <button
          onClick={onClear}
          className="flex items-center gap-0.5 text-[10px] text-[#4A5070] hover:text-[#E8E8F0] hover:bg-[#1E2240] px-1.5 py-0.5 rounded transition"
          title="Clear console"
        >
          <X size={9} />
          Clear
        </button>
      </div>

      {/* Log entries */}
      {open && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-[11px] leading-5"
          style={{ minHeight: 0 }}
        >
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#2a2d4a] text-[10px] select-none">
              No output yet — run the preview to see console logs
            </div>
          ) : (
            entries.map((entry) => (
              <ConsoleRow key={entry.id} entry={entry} tick={tick} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Console Row ──────────────────────────────────────────────────────────────
function ConsoleRow({ entry, tick }: { entry: ConsoleEntry; tick: number }) {
  // tick is only used to force re-render for timestamp refresh — suppress lint warning
  void tick;

  const levelStyles: Record<ConsoleLevel, string> = {
    log: 'text-[#9CA3AF]',
    warn: 'text-[#FCD34D] bg-yellow-950/20',
    error: 'text-[#F87171] bg-red-950/20',
  };

  const prefixStyles: Record<ConsoleLevel, string> = {
    log: 'text-[#4A5070]',
    warn: 'text-[#F59E0B]',
    error: 'text-[#EF4444]',
  };

  const prefixSymbol: Record<ConsoleLevel, string> = {
    log: '>',
    warn: '!',
    error: 'x',
  };

  return (
    <div className={cn('flex items-start gap-2 px-3 py-0.5 border-b border-[#0d0f1d]/60 hover:bg-[#111320]/50 group', levelStyles[entry.level])}>
      {/* Level prefix */}
      <span className={cn('shrink-0 w-3 text-center font-bold text-[10px] mt-0.5', prefixStyles[entry.level])}>
        {prefixSymbol[entry.level]}
      </span>

      {/* Message */}
      <span className="flex-1 break-all whitespace-pre-wrap min-w-0">
        {entry.text}
      </span>

      {/* Relative timestamp */}
      <span className="shrink-0 text-[9px] text-[#2a2d4a] group-hover:text-[#4A5070] transition ml-2 mt-0.5 whitespace-nowrap">
        {relativeTime(entry.wallTs)}
      </span>
    </div>
  );
}

// ─── Patch notification banner ────────────────────────────────────────────────
/**
 * Displayed above the editor for every pending code patch.
 * Accept applies the full file replacement; Reject dismisses.
 */
function PatchBanner({
  patch,
  onAccept,
  onReject,
}: {
  patch: PendingPatch;
  onAccept: (patch: PendingPatch) => void;
  onReject: (patchId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#1A1F3A] border border-[#7C6BF2]/40 rounded-lg text-xs shrink-0">
      <GitMerge size={13} className="text-[#7C6BF2] shrink-0" />
      <span className="text-[#A0A8D0] min-w-0 truncate">
        <span className="text-[#7C6BF2] font-semibold">{patch.agent_name}</span>
        {' '}wants to update{' '}
        <span className="font-mono text-[#E8E8F0]">{patch.filename}</span>
      </span>
      <div className="flex items-center gap-1 ml-auto shrink-0">
        <button
          onClick={() => onAccept(patch)}
          className="flex items-center gap-1 px-2 py-1 bg-[#7C6BF2] hover:bg-[#6C5BE2] text-white rounded transition font-semibold"
        >
          <Check size={10} /> Apply
        </button>
        <button
          onClick={() => onReject(patch.patch_id)}
          className="flex items-center gap-1 px-2 py-1 text-[#8B90B8] hover:text-[#F05A5A] hover:bg-[#2a1a1a] rounded transition"
        >
          <X size={10} /> Reject
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface BuildWorkspaceProps {
  councilId: string;
  councilTopic?: string;
  /**
   * The parent page calls this once to register the patch handler.
   * When a code_patch SSE event arrives, the parent invokes the registered
   * function, which queues the patch for human review in the banner UI.
   */
  onRegisterPatchHandler?: (handler: (patch: CodePatch) => void) => void;
}

let entryIdCounter = 0;

// Monaco custom theme — defined once, matches Council design tokens
const COUNCIL_DARK_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [] as Monaco.editor.ITokenThemeRule[],
  colors: {
    'editor.background': '#0B0D14',
    'editor.lineHighlightBackground': '#111320',
    'editorGutter.background': '#0B0D14',
    'editor.selectionBackground': '#2E3460',
    'editorLineNumber.foreground': '#3D4166',
    'editorLineNumber.activeForeground': '#7C6BF2',
    'editorCursor.foreground': '#7C6BF2',
    'editor.findMatchBackground': '#7C6BF240',
    'editor.findMatchHighlightBackground': '#7C6BF220',
  },
};

export function BuildWorkspace({ councilId, onRegisterPatchHandler }: BuildWorkspaceProps) {
  const [files, setFiles] = React.useState<WorkspaceFile[]>(() =>
    loadFromStorage(councilId) ?? DEFAULT_FILES,
  );
  const [activeFile, setActiveFile] = React.useState<string>('index.html');
  const [previewDoc, setPreviewDoc] = React.useState<string>('');
  const [previewKey, setPreviewKey] = React.useState(0);
  const [showNewFile, setShowNewFile] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const editorRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = React.useRef<typeof Monaco | null>(null);

  // Console state
  const [consoleLogs, setConsoleLogs] = React.useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = React.useState(true);
  const [consoleHeight, setConsoleHeight] = React.useState(DEFAULT_CONSOLE_HEIGHT);

  // Code patch state — pending banners + flash highlights
  // Key = filename, value = timestamp when the green flash should END (Date.now() + 1500ms)
  const [flashFiles, setFlashFiles] = React.useState<Record<string, number>>({});

  // File rename state
  const [renamingFile, setRenamingFile] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');

  // File upload ref
  const fileUploadRef = React.useRef<HTMLInputElement>(null);

  // Modal visibility state
  const [showGithubImport, setShowGithubImport] = React.useState(false);
  const [showTemplates, setShowTemplates] = React.useState(false);
  const [showSecrets, setShowSecrets] = React.useState(false);

  // Secrets state
  const [secrets, setSecrets] = React.useState<Record<string, string>>({});

  const pendingPatches = useCouncilStore((s) => s.pendingPatches);
  const addPendingPatch = useCouncilStore((s) => s.addPendingPatch);
  const acceptPatch = useCouncilStore((s) => s.acceptPatch);
  const rejectPatch = useCouncilStore((s) => s.rejectPatch);

  // Build preview doc whenever files or secrets change
  React.useEffect(() => {
    let doc = buildPreviewDoc(files);
    if (Object.keys(secrets).length > 0) {
      const script = buildSecretsScript(secrets);
      // Inject right after <head> so secrets are available to all scripts
      doc = doc.replace('<head>', '<head>' + script);
    }
    setPreviewDoc(doc);
  }, [files, secrets]);

  // Auto-refresh the preview when doc changes
  React.useEffect(() => {
    if (autoRefresh) setPreviewKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDoc]);

  // Clear console and Monaco markers when preview re-runs
  React.useEffect(() => {
    setConsoleLogs([]);
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) monacoRef.current.editor.setModelMarkers(model, 'runtime-errors', []);
    }
  }, [previewKey]);

  // Persist to localStorage on file change
  React.useEffect(() => {
    saveToStorage(councilId, files);
  }, [councilId, files]);

  // Register the code patch handler with the parent so SSE events route here
  React.useEffect(() => {
    if (!onRegisterPatchHandler) return;
    onRegisterPatchHandler((patch: CodePatch) => {
      const pending: PendingPatch = {
        ...patch,
        patch_id: `patch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        received_at: Date.now(),
      };
      addPendingPatch(pending);
    });
  // onRegisterPatchHandler is a stable ref from the parent — only wire once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expire green flash highlights when their timer ends
  React.useEffect(() => {
    const active = Object.entries(flashFiles).filter(([, expires]) => expires > Date.now());
    if (active.length === 0) return;
    const soonest = Math.min(...active.map(([, e]) => e));
    const timer = setTimeout(() => {
      setFlashFiles((prev) => {
        const next: Record<string, number> = {};
        const n = Date.now();
        for (const [k, v] of Object.entries(prev)) {
          if (v > n) next[k] = v;
        }
        return next;
      });
    }, soonest - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [flashFiles]);

  // Listen for postMessage console events from the iframe
  React.useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Only accept messages that look like our console bridge payload.
      // We intentionally do NOT check event.origin because srcDoc iframes
      // post from 'null' origin on all browsers.
      const data = event.data;
      if (
        data &&
        typeof data === 'object' &&
        data.type === 'console' &&
        (data.level === 'log' || data.level === 'warn' || data.level === 'error') &&
        Array.isArray(data.args)
      ) {
        const text = (data.args as string[]).join(' ');
        setConsoleLogs((prev) => [
          ...prev,
          {
            id: ++entryIdCounter,
            level: data.level as ConsoleLevel,
            text,
            ts: typeof data.ts === 'number' ? data.ts : 0,
            wallTs: Date.now(),
          },
        ]);
        // Auto-open the console if an error arrives while it's collapsed
        if (data.level === 'error') {
          setConsoleOpen(true);
          // Wire runtime errors to Monaco inline squiggles
          if (
            monacoRef.current &&
            editorRef.current &&
            typeof data.lineno === 'number'
          ) {
            const model = editorRef.current.getModel();
            if (model) {
              const lineCount = model.getLineCount();
              const line = Math.min(data.lineno, lineCount);
              monacoRef.current.editor.setModelMarkers(model, 'runtime-errors', [{
                startLineNumber: line,
                startColumn: 1,
                endLineNumber: line,
                endColumn: model.getLineLength(line) + 1,
                message: text,
                severity: monacoRef.current.MarkerSeverity.Error,
                source: 'Runtime',
              }]);
            }
          }
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const currentFile = files.find((f) => f.name === activeFile) ?? files[0];

  function updateFileContent(content: string) {
    setFiles((prev) =>
      prev.map((f) => (f.name === currentFile?.name ? { ...f, content } : f)),
    );
  }

  function handleNewFile(name: string) {
    const language = getLanguage(name);
    const newFile: WorkspaceFile = { name, language, content: '' };
    setFiles((prev) => [...prev, newFile]);
    setActiveFile(name);
    setShowNewFile(false);
  }

  function handleDeleteFile(name: string) {
    if (files.length <= 1) return; // don't delete last file
    setFiles((prev) => prev.filter((f) => f.name !== name));
    if (activeFile === name) setActiveFile(files[0]?.name ?? '');
  }

  function handleCopyCode() {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleRunPreview() {
    setPreviewKey((k) => k + 1);
  }

  // --- File rename handlers -------------------------------------------------

  function commitRename() {
    if (!renamingFile) return;
    const newName = renameValue.trim();

    // Validation: not empty, no slashes, no duplicates (ignoring the file itself)
    if (
      !newName ||
      newName.includes('/') ||
      newName.includes('\\') ||
      (newName !== renamingFile && files.some((f) => f.name === newName))
    ) {
      setRenamingFile(null);
      setRenameValue('');
      return;
    }

    if (newName !== renamingFile) {
      setFiles((prev) =>
        prev.map((f) =>
          f.name === renamingFile
            ? { ...f, name: newName, language: getLanguage(newName) }
            : f,
        ),
      );
      if (activeFile === renamingFile) setActiveFile(newName);
    }

    setRenamingFile(null);
    setRenameValue('');
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      setRenamingFile(null);
      setRenameValue('');
    }
  }

  // --- File upload from disk ------------------------------------------------

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploaded = e.target.files;
    if (!uploaded) return;
    const newFiles: WorkspaceFile[] = [];
    for (const file of Array.from(uploaded)) {
      const content = await file.text();
      newFiles.push({ name: file.name, language: getLanguage(file.name), content });
    }
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of newFiles) {
        const idx = merged.findIndex((x) => x.name === f.name);
        if (idx >= 0) merged[idx] = f; // overwrite on name collision
        else merged.push(f);
      }
      return merged;
    });
    if (newFiles.length > 0) setActiveFile(newFiles[0].name);
    // Reset so the same file can be re-uploaded
    e.target.value = '';
  }

  // --- ZIP download with fflate, per-file fallback -------------------------

  async function handleDownloadZip() {
    try {
      const { zip } = await import('fflate');
      const zipData: Record<string, Uint8Array> = {};
      for (const file of files) {
        zipData[file.name] = new TextEncoder().encode(file.content);
      }
      zip(zipData, (err, data) => {
        if (err) {
          handleDownloadFallback();
          return;
        }
        const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project.zip';
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch {
      handleDownloadFallback();
    }
  }

  function handleDownloadFallback() {
    for (const file of files) {
      const blob = new Blob([file.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // --- Patch accept / reject -----------------------------------------------

  function handleAcceptPatch(patch: PendingPatch) {
    // Apply content to files state; create the file if it doesn't exist yet
    setFiles((prev) => {
      const exists = prev.some((f) => f.name === patch.filename);
      if (exists) {
        return prev.map((f) =>
          f.name === patch.filename ? { ...f, content: patch.content } : f,
        );
      }
      return [
        ...prev,
        { name: patch.filename, language: patch.language, content: patch.content },
      ];
    });

    // Switch editor focus to the patched file
    setActiveFile(patch.filename);

    // Flash the file tree entry green for 1500ms
    setFlashFiles((prev) => ({ ...prev, [patch.filename]: Date.now() + 1500 }));

    // Remove from pending, add to applied history in store
    acceptPatch(patch.patch_id);
  }

  function handleRejectPatch(patchId: string) {
    rejectPatch(patchId);
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0f1d] text-[#E8E8F0] overflow-hidden">

      {/*
        Hidden file input — placed at the top level of the JSX, outside any
        interactive container, so click propagation cannot interfere with it.
      */}
      <input
        ref={fileUploadRef}
        type="file"
        multiple
        accept=".html,.css,.js,.ts,.tsx,.jsx,.json,.md,.txt,.yaml,.yml,.py,.sh"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* ── Pending patch banners ─────────────────────────────── */}
      {pendingPatches.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-[#1E2240] bg-[#0d0f1d] shrink-0">
          {pendingPatches.map((patch) => (
            <PatchBanner
              key={patch.patch_id}
              patch={patch}
              onAccept={handleAcceptPatch}
              onReject={handleRejectPatch}
            />
          ))}
        </div>
      )}

      {/* ── Editor row (file tree + editor + preview) ─────────── */}
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden">

      {/* ── File Tree (fixed 180px sidebar) ───────────────────── */}
      <div className="w-[180px] shrink-0 flex flex-col h-full bg-[#111320] border-r border-[#1E2240]">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1E2240]">
          <span className="text-[10px] font-semibold text-[#8B90B8] uppercase tracking-wider">Files</span>
          <div className="flex items-center gap-1">
            {/* Upload button */}
            <button
              onClick={() => fileUploadRef.current?.click()}
              className="p-0.5 rounded hover:bg-[#1E2240] text-[#8B90B8] hover:text-[#E8E8F0] transition"
              title="Upload files from disk"
            >
              <Upload size={12} />
            </button>
            {/* New file button */}
            <button
              onClick={() => setShowNewFile(true)}
              className="p-0.5 rounded hover:bg-[#1E2240] text-[#8B90B8] hover:text-[#E8E8F0] transition"
              title="New file"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto py-1">
          {files.map((file) => {
            const isFlashing = (flashFiles[file.name] ?? 0) > Date.now();
            const isRenaming = renamingFile === file.name;

            return (
              <div
                key={file.name}
                className={cn(
                  'group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition',
                  isFlashing
                    ? 'bg-emerald-900/40 text-emerald-300'
                    : activeFile === file.name
                    ? 'bg-[#1E2240] text-[#E8E8F0]'
                    : 'text-[#8B90B8] hover:bg-[#161928] hover:text-[#E8E8F0]',
                )}
                onClick={() => {
                  if (!isRenaming) setActiveFile(file.name);
                }}
              >
                <FileIcon name={file.name} />

                {isRenaming ? (
                  <input
                    autoFocus
                    className="flex-1 min-w-0 bg-[#0d0f1d] border border-[#7C6BF2] text-[#E8E8F0] text-xs rounded px-1 py-0.5 font-mono focus:outline-none"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={handleRenameKeyDown}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 truncate font-mono"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingFile(file.name);
                      setRenameValue(file.name);
                    }}
                    title="Double-click to rename"
                  >
                    {file.name}
                  </span>
                )}

                {!isRenaming && files.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.name); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-900/40 text-[#8B90B8] hover:text-[#F05A5A] transition"
                    title="Delete file"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="border-t border-[#1E2240] p-2 flex flex-col gap-1">
          <button
            onClick={handleDownloadZip}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240] rounded transition"
          >
            <Download size={11} /> Download ZIP
          </button>
          <button
            onClick={() => setShowGithubImport(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240] rounded transition"
          >
            <GitBranch size={11} /> Import from GitHub
          </button>
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240] rounded transition"
          >
            <LayoutTemplate size={11} /> Templates
          </button>
          <button
            onClick={() => setShowSecrets(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240] rounded transition"
          >
            <Lock size={11} /> Secrets
          </button>
          <button
            onClick={() => {
              if (confirm('Reset workspace to default dog walker template?')) {
                const fresh = DEFAULT_FILES;
                setFiles(fresh);
                setActiveFile('index.html');
                saveToStorage(councilId, fresh);
              }
            }}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240] rounded transition"
          >
            <RefreshCw size={11} /> Reset
          </button>
        </div>
      </div>

      {/* ── Editor + Preview (resizable, fills remaining space) ── */}
      <PanelGroup orientation="horizontal" className="flex-1 min-w-0 min-h-0">

      {/* ── Editor + Console ──────────────────────────────────── */}
      <Panel defaultSize={55} minSize={30} onResize={() => editorRef.current?.layout()}>
      <div className="flex flex-col h-full">

        {/* Editor toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1E2240] bg-[#111320] shrink-0">
          {/* File tabs (show up to 6) */}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
            {files.slice(0, 6).map((file) => (
              <button
                key={file.name}
                onClick={() => setActiveFile(file.name)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition shrink-0',
                  activeFile === file.name
                    ? 'bg-[#1E2240] text-[#E8E8F0]'
                    : 'text-[#4A5070] hover:text-[#8B90B8] hover:bg-[#161928]',
                )}
              >
                <FileIcon name={file.name} />
                {file.name}
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 px-2 py-1 text-xs text-[#8B90B8] hover:text-[#E8E8F0] hover:bg-[#1E2240] rounded transition"
              title="Copy current file"
            >
              {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
            </button>
          </div>
        </div>

        {/* Monaco Editor — flex-1 so it fills remaining height above console */}
        <div className="flex-1 min-h-0">
          {currentFile && (
            <MonacoEditor
              height="100%"
              language={currentFile.language}
              value={currentFile.content}
              theme="council-dark"
              beforeMount={(monaco) => {
                monaco.editor.defineTheme('council-dark', COUNCIL_DARK_THEME);
              }}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco;
                // Force initial layout — required when automaticLayout: false
                setTimeout(() => editor.layout(), 0);
              }}
              onChange={(value) => updateFileContent(value ?? '')}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbersMinChars: 3,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'gutter',
                smoothScrolling: true,
                cursorSmoothCaretAnimation: 'on',
                bracketPairColorization: { enabled: true },
                automaticLayout: false,
                overviewRulerLanes: 0,
                lineHeight: 22,
              }}
            />
          )}
        </div>

        {/* Console Panel — fixed height below editor, resizable via drag handle */}
        <ConsolePanel
          entries={consoleLogs}
          height={consoleHeight}
          open={consoleOpen}
          onToggle={() => setConsoleOpen((v) => !v)}
          onClear={() => setConsoleLogs([])}
          onResize={setConsoleHeight}
        />
      </div>
      </Panel>
      <PanelResizeHandle className="w-[3px] bg-[#1E2240] hover:bg-[#7C6BF2] cursor-col-resize transition-colors" />

      {/* ── Live Preview (right) ─────────────────────────────── */}
      <Panel defaultSize={45} minSize={15}>
      <div className="flex flex-col h-full">

        {/* Preview toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1E2240] bg-[#111320] shrink-0">
          {/* Traffic-light dots (Replit style) */}
          <div className="flex items-center gap-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#F05A5A]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#F5A623]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#7ED321]" />
          </div>

          <span className="text-xs text-[#4A5070] flex-1 font-mono truncate">preview</span>

          <div className="flex items-center gap-1 shrink-0">
            <label className="flex items-center gap-1 text-[10px] text-[#4A5070] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-3 h-3 rounded"
              />
              Auto
            </label>
            <button
              onClick={handleRunPreview}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-[#7C6BF2] hover:bg-[#6C5BE2] text-white rounded transition font-semibold"
              title="Refresh preview"
            >
              <Play size={10} /> Run
            </button>
          </div>
        </div>

        {/* iframe preview */}
        <div className="flex-1 bg-white overflow-hidden">
          <iframe
            ref={iframeRef}
            key={previewKey}
            srcDoc={previewDoc}
            sandbox="allow-scripts allow-forms allow-same-origin"
            className="w-full h-full border-0"
            title="Live Preview"
          />
        </div>
      </div>
      </Panel>

      </PanelGroup>{/* end editor+preview panels */}
      </div>{/* end editor row */}

      {/* ── Modals ────────────────────────────────────────────── */}

      {showNewFile && (
        <NewFileModal
          onConfirm={handleNewFile}
          onClose={() => setShowNewFile(false)}
        />
      )}

      {showGithubImport && (
        <GitHubImportModal
          onImport={(importedFiles) => {
            setFiles(importedFiles);
            setActiveFile(importedFiles[0]?.name ?? '');
            setShowGithubImport(false);
          }}
          onClose={() => setShowGithubImport(false)}
        />
      )}

      {showTemplates && (
        <TemplateChooserModal
          onSelect={(templateFiles) => {
            setFiles(templateFiles);
            setActiveFile(templateFiles[0]?.name ?? '');
            setShowTemplates(false);
          }}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {showSecrets && (
        <SecretsPanel
          councilId={councilId}
          onSecretsChange={setSecrets}
          isOpen={showSecrets}
          onClose={() => setShowSecrets(false)}
        />
      )}
    </div>
  );
}
