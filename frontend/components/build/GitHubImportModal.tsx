'use client';

/**
 * GitHubImportModal — Import files from any public GitHub repository.
 *
 * Supports URLs in all common formats:
 *   - https://github.com/user/repo
 *   - https://github.com/user/repo/tree/branch
 *   - https://github.com/user/repo/tree/branch/path/to/dir
 *   - https://github.com/user/repo/blob/branch/path/to/file.ext
 *
 * Uses GitHub's public REST API (no auth required, 60 req/hr rate limit).
 * Fetches the git tree recursively, filters to importable text files,
 * then downloads raw content in batched parallel fetches.
 */

import * as React from 'react';
import {
  GitFork,
  FileCode,
  FileText,
  Globe,
  X,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import type { WorkspaceFile } from './defaultFiles';
import { getLanguage } from './defaultFiles';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GitHubImportModalProps {
  onImport: (files: WorkspaceFile[]) => void;
  onClose: () => void;
}

interface ParsedGitHubURL {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  /** 'tree' for directories/root, 'blob' for single files */
  type: 'tree' | 'blob';
}

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

interface FilePreviewEntry {
  path: string;
  displayPath: string;
  size: number;
}

type ModalState =
  | { step: 'input' }
  | { step: 'loading'; message: string; progress?: number; total?: number }
  | { step: 'preview'; files: FilePreviewEntry[]; parsed: ParsedGitHubURL }
  | { step: 'error'; message: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPORTABLE_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.json',
  '.md', '.txt', '.yaml', '.yml', '.toml', '.py', '.sh',
]);

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', '__pycache__',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
]);

const MAX_FILE_SIZE = 300 * 1024; // 300KB

const MAX_FILES_WARNING = 50;

const MAX_CONCURRENT_FETCHES = 10;

const SAMPLE_URLS = [
  'github.com/nicklvsa/js-canvas-game',
  'github.com/nickvdyck/vanilla-js-todo',
  'github.com/kristoferjoseph/flexboxgrid',
];

// ─── URL Parser ───────────────────────────────────────────────────────────────

function parseGitHubURL(raw: string): ParsedGitHubURL | null {
  let url = raw.trim();

  // Strip trailing slashes
  url = url.replace(/\/+$/, '');

  // Normalize: add https:// if missing
  if (url.startsWith('github.com')) {
    url = 'https://' + url;
  }

  // Must be a github.com URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
    return null;
  }

  // Split path: /owner/repo[/tree|blob/branch[/path...]]
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1];

  // Just /owner/repo — default branch, root path
  if (segments.length === 2) {
    return { owner, repo, branch: '', path: '', type: 'tree' };
  }

  // /owner/repo/tree/branch[/path...]
  // /owner/repo/blob/branch/path...
  const action = segments[2]; // 'tree' or 'blob'
  if (action !== 'tree' && action !== 'blob') {
    // Might be something else like /issues, /pulls — treat as root import
    return { owner, repo, branch: '', path: '', type: 'tree' };
  }

  if (segments.length < 4) {
    // /owner/repo/tree with no branch — malformed but recoverable
    return { owner, repo, branch: '', path: '', type: 'tree' };
  }

  const branch = segments[3];
  const pathParts = segments.slice(4);
  const path = pathParts.join('/');

  return {
    owner,
    repo,
    branch,
    path,
    type: action as 'tree' | 'blob',
  };
}

// ─── File filtering ──────────────────────────────────────────────────────────

function isImportableFile(entry: TreeEntry, subfolderPrefix: string): boolean {
  if (entry.type !== 'blob') return false;

  const path = entry.path;

  // If a subfolder was specified, only include files under it
  if (subfolderPrefix && !path.startsWith(subfolderPrefix)) {
    return false;
  }

  // Skip files over size limit
  if (entry.size !== undefined && entry.size > MAX_FILE_SIZE) {
    return false;
  }

  // Skip lock files
  const filename = path.split('/').pop() ?? '';
  if (SKIP_FILES.has(filename)) return false;

  // Skip hidden files/folders EXCEPT .env.example
  const parts = path.split('/');
  for (const part of parts) {
    if (part.startsWith('.') && part !== '.env.example') {
      return false;
    }
  }

  // Skip blacklisted directories
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) {
      return false;
    }
  }

  // Must have an importable extension
  const extMatch = filename.match(/\.[^.]+$/);
  if (!extMatch) {
    // Special case: .env.example has no traditional extension
    if (filename === '.env.example') return true;
    return false;
  }

  return IMPORTABLE_EXTENSIONS.has(extMatch[0]);
}

// ─── Batched parallel fetch ──────────────────────────────────────────────────

async function fetchInBatches<T>(
  items: T[],
  batchSize: number,
  fetcher: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item, batchIndex) => fetcher(item, i + batchIndex)));
  }
}

// ─── Human-readable file size ────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── File icon for preview list ──────────────────────────────────────────────

function PreviewFileIcon({ name }: { name: string }) {
  if (name.endsWith('.html')) return <Globe size={13} className="text-[#f97316] shrink-0" />;
  if (name.endsWith('.css')) return <FileText size={13} className="text-[#6366f1] shrink-0" />;
  if (name.endsWith('.js') || name.endsWith('.jsx'))
    return <FileCode size={13} className="text-[#eab308] shrink-0" />;
  if (name.endsWith('.ts') || name.endsWith('.tsx'))
    return <FileCode size={13} className="text-[#3b82f6] shrink-0" />;
  if (name.endsWith('.py'))
    return <FileCode size={13} className="text-[#22d387] shrink-0" />;
  if (name.endsWith('.json'))
    return <FileText size={13} className="text-[#F5A623] shrink-0" />;
  return <FileText size={13} className="text-[#8B90B8] shrink-0" />;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function GitHubImportModal({ onImport, onClose }: GitHubImportModalProps) {
  const [url, setUrl] = React.useState('');
  const [state, setState] = React.useState<ModalState>({ step: 'input' });
  const [showLargeWarning, setShowLargeWarning] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Cached data between preview and confirm
  const cachedTreeRef = React.useRef<TreeEntry[]>([]);
  const cachedParsedRef = React.useRef<ParsedGitHubURL | null>(null);

  // Close on Escape
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // If loading, abort the fetch first
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-focus input on mount
  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // ── Fetch repo tree ────────────────────────────────────────────────────

  async function handleFetchTree() {
    const parsed = parseGitHubURL(url);
    if (!parsed) {
      setState({ step: 'error', message: 'Invalid GitHub URL. Paste a link like github.com/user/repo' });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    try {
      setState({ step: 'loading', message: 'Fetching repository info...' });

      let branch = parsed.branch;

      // If no branch specified, fetch default branch from repo info
      if (!branch) {
        const repoRes = await fetch(
          `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
          { signal },
        );

        if (signal.aborted) return;

        if (repoRes.status === 404) {
          setState({ step: 'error', message: 'Repository not found or private. Only public repos can be imported.' });
          return;
        }
        if (repoRes.status === 403) {
          const remaining = repoRes.headers.get('x-ratelimit-remaining');
          if (remaining === '0') {
            setState({ step: 'error', message: 'GitHub API rate limit reached (60 requests/hour for unauthenticated users). Try again in a few minutes.' });
            return;
          }
          setState({ step: 'error', message: 'Access denied. The repository may be private.' });
          return;
        }
        if (!repoRes.ok) {
          setState({ step: 'error', message: `GitHub API error: ${repoRes.status} ${repoRes.statusText}` });
          return;
        }

        const repoData = await repoRes.json() as { default_branch: string };
        branch = repoData.default_branch;
        parsed.branch = branch;
      }

      setState({ step: 'loading', message: 'Fetching repository tree...' });

      // For a single-file blob import, skip tree fetch
      if (parsed.type === 'blob' && parsed.path) {
        setState({ step: 'loading', message: 'Fetching file...' });

        const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${parsed.path}`;
        const fileRes = await fetch(rawUrl, { signal });

        if (signal.aborted) return;

        if (!fileRes.ok) {
          setState({ step: 'error', message: `File not found: ${parsed.path}` });
          return;
        }

        const content = await fileRes.text();
        const filename = parsed.path.split('/').pop() ?? parsed.path;

        onImport([{
          name: filename,
          language: getLanguage(filename),
          content,
        }]);
        return;
      }

      // Fetch full tree
      const treeRes = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`,
        { signal },
      );

      if (signal.aborted) return;

      if (treeRes.status === 404) {
        setState({ step: 'error', message: `Branch "${branch}" not found in ${parsed.owner}/${parsed.repo}.` });
        return;
      }
      if (treeRes.status === 403) {
        const remaining = treeRes.headers.get('x-ratelimit-remaining');
        if (remaining === '0') {
          setState({ step: 'error', message: 'GitHub API rate limit reached (60 requests/hour). Try again in a few minutes.' });
          return;
        }
        setState({ step: 'error', message: 'Access denied fetching repository tree.' });
        return;
      }
      if (!treeRes.ok) {
        setState({ step: 'error', message: `GitHub API error: ${treeRes.status} ${treeRes.statusText}` });
        return;
      }

      const treeData = await treeRes.json() as { tree: TreeEntry[]; truncated: boolean };

      // Filter to importable files
      const subfolderPrefix = parsed.path ? (parsed.path.endsWith('/') ? parsed.path : parsed.path + '/') : '';
      const importable = treeData.tree.filter((entry) => isImportableFile(entry, subfolderPrefix));

      if (importable.length === 0) {
        setState({ step: 'error', message: 'No importable files found. The repository may only contain binary files, or the path may be incorrect.' });
        return;
      }

      // Build preview entries
      const previewFiles: FilePreviewEntry[] = importable.map((entry) => {
        let displayPath = entry.path;
        if (subfolderPrefix && displayPath.startsWith(subfolderPrefix)) {
          displayPath = displayPath.slice(subfolderPrefix.length);
        }
        return {
          path: entry.path,
          displayPath,
          size: entry.size ?? 0,
        };
      });

      // Cache for the confirm step
      cachedTreeRef.current = importable;
      cachedParsedRef.current = parsed;

      // If too many files, show warning inline in preview
      if (previewFiles.length > MAX_FILES_WARNING) {
        setShowLargeWarning(true);
      } else {
        setShowLargeWarning(false);
      }

      setState({ step: 'preview', files: previewFiles, parsed });

    } catch (err: unknown) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        setState({ step: 'error', message: 'Network error. Check your internet connection and try again.' });
      } else {
        setState({ step: 'error', message });
      }
    }
  }

  // ── Import confirmed files ─────────────────────────────────────────────

  async function handleConfirmImport() {
    const importable = cachedTreeRef.current;
    const parsed = cachedParsedRef.current;
    if (!importable.length || !parsed) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    const total = importable.length;
    let loaded = 0;

    setState({ step: 'loading', message: `Loading ${total} files...`, progress: 0, total });

    const subfolderPrefix = parsed.path ? (parsed.path.endsWith('/') ? parsed.path : parsed.path + '/') : '';
    const results: WorkspaceFile[] = [];
    const errors: string[] = [];

    try {
      await fetchInBatches(importable, MAX_CONCURRENT_FETCHES, async (entry) => {
        if (signal.aborted) return;

        const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${entry.path}`;

        try {
          const res = await fetch(rawUrl, { signal });

          if (signal.aborted) return;

          if (!res.ok) {
            errors.push(entry.path);
            loaded++;
            setState({ step: 'loading', message: `Importing... (${loaded}/${total})`, progress: loaded, total });
            return;
          }

          const content = await res.text();

          let displayPath = entry.path;
          if (subfolderPrefix && displayPath.startsWith(subfolderPrefix)) {
            displayPath = displayPath.slice(subfolderPrefix.length);
          }

          results.push({
            name: displayPath,
            language: getLanguage(displayPath),
            content,
          });
        } catch {
          if (!signal.aborted) {
            errors.push(entry.path);
          }
        }

        loaded++;
        if (!signal.aborted) {
          setState({ step: 'loading', message: `Importing... (${loaded}/${total})`, progress: loaded, total });
        }
      });

      if (signal.aborted) return;

      if (results.length === 0) {
        setState({ step: 'error', message: 'Failed to download any files. Check your connection and try again.' });
        return;
      }

      onImport(results);

    } catch (err: unknown) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Import failed unexpectedly.';
      setState({ step: 'error', message });
    }
  }

  // ── Navigate back to input ─────────────────────────────────────────────

  function handleBack() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    cachedTreeRef.current = [];
    cachedParsedRef.current = null;
    setShowLargeWarning(false);
    setState({ step: 'input' });
  }

  // ── Handle form submit ─────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    handleFetchTree();
  }

  // ── Handle backdrop click ──────────────────────────────────────────────

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      onClose();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-[#1e2030] border border-[#2a2d4a] rounded-xl shadow-2xl w-[480px] max-w-[92vw] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-1 shrink-0">
          {(state.step === 'preview' || state.step === 'error') && (
            <button
              onClick={handleBack}
              className="p-1 rounded hover:bg-[#2a2d4a] text-[#8B90B8] hover:text-[#E8E8F0] transition"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GitFork size={18} className="text-[#E8E8F0] shrink-0" />
            <h2 className="text-[15px] font-semibold text-[#E8E8F0]">Import from GitHub</h2>
          </div>
          <button
            onClick={() => {
              if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
              }
              onClose();
            }}
            className="p-1 rounded hover:bg-[#2a2d4a] text-[#8B90B8] hover:text-[#E8E8F0] transition"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Input State ────────────────────────────────────────── */}
        {state.step === 'input' && (
          <form onSubmit={handleSubmit} className="flex flex-col px-5 pb-5 pt-2">
            <p className="text-xs text-[#8B90B8] mb-4">
              Paste any public repository URL
            </p>

            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              className={cn(
                'w-full bg-[#0d0f1d] border text-[#E8E8F0] text-sm rounded-lg px-3 py-2.5 mb-3',
                'placeholder:text-[#4A5070]',
                'focus:outline-none focus:border-[#7C6BF2] transition',
                'border-[#2a2d4a]',
              )}
              autoComplete="off"
              spellCheck={false}
            />

            {/* Sample URL chips */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {SAMPLE_URLS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setUrl('https://' + sample)}
                  className={cn(
                    'text-[11px] px-2.5 py-1 rounded-full border transition',
                    'text-[#8B90B8] border-[#2a2d4a] hover:border-[#7C6BF2] hover:text-[#E8E8F0]',
                    'bg-[#0d0f1d] hover:bg-[#161928]',
                  )}
                >
                  {sample}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'flex-1 text-sm py-2 rounded-lg border transition font-medium',
                  'text-[#8B90B8] border-[#2a2d4a] hover:text-[#E8E8F0] hover:border-[#4A5070]',
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!url.trim()}
                className={cn(
                  'flex-1 text-sm py-2 rounded-lg font-semibold transition',
                  url.trim()
                    ? 'bg-[#7C6BF2] hover:bg-[#6C5BE2] text-white'
                    : 'bg-[#2a2d4a] text-[#4A5070] cursor-not-allowed',
                )}
              >
                Import
              </button>
            </div>
          </form>
        )}

        {/* ── Loading State ──────────────────────────────────────── */}
        {state.step === 'loading' && (
          <div className="flex flex-col items-center justify-center px-5 pb-6 pt-4 gap-4">
            <Loader2 size={28} className="text-[#7C6BF2] animate-spin" />
            <p className="text-sm text-[#8B90B8] text-center">{state.message}</p>
            {state.total !== undefined && state.progress !== undefined && (
              <div className="w-full max-w-[280px]">
                <div className="w-full h-2 bg-[#1E2240] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#7C6BF2] rounded-full transition-all duration-200"
                    style={{ width: `${Math.round((state.progress / state.total) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#4A5070] text-center mt-1.5">
                  {state.progress} / {state.total} files
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={handleBack}
              className="text-xs text-[#8B90B8] hover:text-[#E8E8F0] transition mt-1"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Preview State ──────────────────────────────────────── */}
        {state.step === 'preview' && (
          <div className="flex flex-col px-5 pb-5 pt-2 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm text-[#E8E8F0] font-medium">
                Found {state.files.length} file{state.files.length !== 1 ? 's' : ''}
              </p>
              <span className="text-[10px] text-[#4A5070] font-mono">
                {state.parsed.owner}/{state.parsed.repo}
                {state.parsed.path ? `/${state.parsed.path}` : ''}
              </span>
            </div>

            {/* Large repo warning */}
            {showLargeWarning && (
              <div className="flex items-start gap-2 p-3 mb-3 bg-[#2a1a0a] border border-[#F5A623]/30 rounded-lg">
                <AlertCircle size={14} className="text-[#F5A623] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[#F5A623] font-medium">Large repository</p>
                  <p className="text-[11px] text-[#8B90B8] mt-0.5">
                    {state.files.length} files will be imported. This may take a moment and use significant memory.
                  </p>
                </div>
              </div>
            )}

            {/* File list — scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0 max-h-[280px] border border-[#2a2d4a] rounded-lg bg-[#0d0f1d] mb-4">
              {state.files.slice(0, 10).map((file) => (
                <div
                  key={file.path}
                  className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1E2240] last:border-b-0"
                >
                  <PreviewFileIcon name={file.displayPath} />
                  <span className="flex-1 text-xs text-[#E8E8F0] font-mono truncate min-w-0">
                    {file.displayPath}
                  </span>
                  {file.size > 0 && (
                    <span className="text-[10px] text-[#4A5070] shrink-0 bg-[#1E2240] px-1.5 py-0.5 rounded">
                      {formatBytes(file.size)}
                    </span>
                  )}
                </div>
              ))}
              {state.files.length > 10 && (
                <div className="flex items-center justify-center py-2 text-[11px] text-[#4A5070]">
                  +{state.files.length - 10} more file{state.files.length - 10 !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleBack}
                className={cn(
                  'flex-1 text-sm py-2 rounded-lg border transition font-medium',
                  'text-[#8B90B8] border-[#2a2d4a] hover:text-[#E8E8F0] hover:border-[#4A5070]',
                )}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="flex-1 text-sm py-2 rounded-lg font-semibold bg-[#7C6BF2] hover:bg-[#6C5BE2] text-white transition"
              >
                Import {state.files.length} file{state.files.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── Error State ────────────────────────────────────────── */}
        {state.step === 'error' && (
          <div className="flex flex-col items-center px-5 pb-5 pt-4 gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F05A5A]/10 flex items-center justify-center">
              <AlertCircle size={20} className="text-[#F05A5A]" />
            </div>
            <p className="text-sm text-[#F05A5A] text-center leading-relaxed max-w-[360px]">
              {state.message}
            </p>
            <div className="flex gap-2 mt-1 w-full">
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'flex-1 text-sm py-2 rounded-lg border transition font-medium',
                  'text-[#8B90B8] border-[#2a2d4a] hover:text-[#E8E8F0] hover:border-[#4A5070]',
                )}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 text-sm py-2 rounded-lg font-semibold bg-[#7C6BF2] hover:bg-[#6C5BE2] text-white transition"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
