import { useEffect, useRef, useState } from "react";
import {
  Compass,
  Download,
  Keyboard,
  Palette,
  RefreshCw,
  Settings,
  StickyNote,
  Upload,
  X,
} from "lucide-react";
import { useThemeStore } from "../store/themeStore";
import { PRESETS, THEME_TOKENS, type Theme } from "../lib/themes";
import {
  applyBundle,
  exportBundle,
  readBundle,
  type BundleScope,
} from "../lib/exportImport";
import { useBoardStore } from "../store/boardStore";
import { checkForUpdates } from "../lib/updater";
import { ShortcutsModal } from "./ShortcutsModal";
import { useOnboardingStore } from "../store/onboardingStore";
import { ConfirmModal, Modal } from "./Modal";
import { useWorkspaceStore } from "../store/workspaceStore";

// Settings panel (top-right, ui-chrome). Theme presets + a custom color editor,
// plus full-board export/import. Mostly themes the background and UI chrome.

const TOKEN_LABELS: Record<keyof Theme, string> = {
  bg: "Background",
  grid: "Grid dots",
  surface: "Panel",
  surfaceSolid: "Panel (solid)",
  surfaceHover: "Hover",
  border: "Rule",
  lineStrong: "Control outline",
  text: "Text",
  textDim: "Text (dim)",
  accent: "Accent",
  accentMark: "Mark",
  danger: "Delete",
  shadow: "Shadow",
};

// A token may hold rgba(); <input type=color> needs #rrggbb. Show a usable hex
// fallback and pass whatever the picker returns straight through.
function hexForPicker(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#888888";
}

export function SettingsPanel() {
  const { name, custom, selectPreset, setCustomToken } = useThemeStore();
  const setError = useBoardStore((s) => s.setError);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [checking, setChecking] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  // Import now depends on what the chosen file turns out to be, so the file is
  // read first and only a device-wide replace asks for confirmation.
  const [pendingAll, setPendingAll] = useState<Awaited<
    ReturnType<typeof readBundle>
  > | null>(null);
  const [exportScope, setExportScope] = useState(false);
  const startTour = useOnboardingStore((s) => s.start);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes the panel and hands focus back to its toggle. Skipped while
  // a dialog is up: that Escape belongs to the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const doCheckUpdates = async () => {
    setChecking(true);
    try {
      await checkForUpdates({ silent: false });
    } finally {
      setChecking(false);
    }
  };

  const doExport = async (scope: BundleScope) => {
    setExportScope(false);
    setBusy("export");
    try {
      await exportBundle(
        scope,
        activeWorkspace ? { id: activeWorkspace.id, name: activeWorkspace.name } : undefined,
      );
    } catch (e) {
      setError(`Export failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Read the file first, then decide. A workspace bundle is additive, so it
   * just happens; only a whole-device replace stops to ask, and it can now say
   * exactly what it is about to destroy.
   */
  const doImport = async () => {
    setBusy("import");
    try {
      const read = await readBundle();
      if (!read) return setBusy(null);
      if (read.scope === "all" && !read.legacy) {
        setPendingAll(read);
        return setBusy(null);
      }
      await applyBundle(read);
      // Simplest reliable way to re-init every store from fresh DB state.
      window.location.reload();
    } catch (e) {
      setError(`Import failed: ${String(e)}`);
      setBusy(null);
    }
  };

  const applyPendingAll = async () => {
    const read = pendingAll;
    setPendingAll(null);
    if (!read) return;
    setBusy("import");
    try {
      await applyBundle(read);
      window.location.reload();
    } catch (e) {
      setError(`Import failed: ${String(e)}`);
      setBusy(null);
    }
  };

  const addNote = useBoardStore((s) => s.addNote);
  const workspaces = useWorkspaceStore((w) => w.workspaces);
  const activeId = useWorkspaceStore((w) => w.activeId);
  const loadLast = useWorkspaceStore((w) => w.loadLast);
  const defaultId = useWorkspaceStore((w) => w.defaultId);
  const setLoadLast = useWorkspaceStore((w) => w.setLoadLast);
  const setDefault = useWorkspaceStore((w) => w.setDefault);
  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;

  return (
    <div className="ui-chrome absolute right-4 top-4 flex flex-col items-end gap-2">
      <button
        className="grid h-10 w-10 place-items-center bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--line-strong)]"
        onClick={() => void addNote()}
        aria-label="Add note"
        title="Add note"
      >
        <StickyNote size={16} />
      </button>
      <button
        ref={toggleRef}
        className="grid h-10 w-10 place-items-center bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--line-strong)]"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close settings" : "Settings"}
        aria-expanded={open}
        title="Settings"
      >
        {open ? <X size={16} /> : <Settings size={16} />}
      </button>

      {open && (
        <div className="chrome sheet w-72 p-3 text-[var(--text)]">
          {/* themes */}
          <div className="ui-label numbered mb-1 flex items-center gap-1.5">
            <Palette size={14} /> Theme
          </div>
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {Object.entries(PRESETS).map(([presetName, theme]) => (
              <button
                key={presetName}
                onClick={() => selectPreset(presetName)}
                aria-pressed={name === presetName}
                className={`flex flex-col items-center gap-1 p-2 ring-1 ${
                  name === presetName
                    ? "ring-[var(--accent)]"
                    : "ring-[var(--line-strong)]"
                }`}
                title={presetName}
              >
                <span
                  className="h-6 w-full"
                  style={{
                    background: theme.bg,
                    boxShadow: `inset 0 0 0 2px ${theme.accent}`,
                  }}
                />
                <span className="ui-mono text-[10px]">{presetName}</span>
              </button>
            ))}
          </div>

          {/* custom colors */}
          <details className="mb-3">
            <summary className="cursor-pointer text-xs text-[var(--text-dim)] hover:text-[var(--text)]">
              Custom colors {name === "Custom" && "(active)"}
            </summary>
            <div className="mt-2 space-y-1.5">
              {THEME_TOKENS.map((token) => (
                <label
                  key={token}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="text-[var(--text-dim)]">
                    {TOKEN_LABELS[token]}
                  </span>
                  <span className="flex items-center gap-1">
                    <input
                      type="text"
                      value={custom[token]}
                      onChange={(e) => setCustomToken(token, e.target.value)}
                      className="w-28 bg-[var(--surface-solid)] px-1.5 py-0.5 text-[10px] text-[var(--text)] outline-none ring-1 ring-[var(--line-strong)] focus:ring-[var(--accent)]"
                    />
                    <input
                      type="color"
                      value={hexForPicker(custom[token])}
                      aria-label={`${TOKEN_LABELS[token]} colour picker`}
                      onChange={(e) => setCustomToken(token, e.target.value)}
                      className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </span>
                </label>
              ))}
            </div>
          </details>

          {/* workspaces */}
          <div className="border-t border-[var(--border)] pt-3">
            <div className="ui-label numbered mb-1.5">Workspace</div>
            <label className="mb-1.5 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={loadLast}
                onChange={(e) => setLoadLast(e.target.checked)}
              />
              <span>Open the workspace I used last</span>
            </label>
            {!loadLast && (
              <>
                <div className="ui-label mb-1">Always open</div>
                <select
                  className="w-full bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] outline-none ring-1 ring-[var(--line-strong)] focus:ring-[var(--accent)]"
                  value={defaultId ?? activeId ?? ""}
                  onChange={(e) => setDefault(e.target.value)}
                  aria-label="Workspace to open on launch"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-dim)]">
              Each workspace keeps its own boards and its own appearance.
            </p>
          </div>

          {/* export / import */}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="ui-label numbered mb-1.5">Board data</div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setExportScope(true)}
                disabled={busy !== null}
                className="btn flex-1 disabled:opacity-40"
              >
                <Download size={14} />
                {busy === "export" ? "Exporting…" : "Export"}
              </button>
              <button
                // Import wipes every board before restoring, so it asks first.
                onClick={() => void doImport()}
                disabled={busy !== null}
                className="btn flex-1 disabled:opacity-40"
              >
                <Upload size={14} />
                {busy === "import" ? "Importing…" : "Import"}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-dim)]">
              Export saves every board and image into one file. Import
              replaces all boards on this device.
            </p>
          </div>

          {/* app / updates */}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <div className="ui-label numbered mb-1.5">App</div>
            <button
              onClick={() => {
                setOpen(false);
                startTour();
              }}
              className="btn mb-1.5 w-full"
            >
              <Compass size={14} />
              Quick tour
            </button>
            <button
              onClick={() => setShortcuts(true)}
              className="btn mb-1.5 w-full"
            >
              <Keyboard size={14} />
              Keyboard shortcuts
            </button>
            <button
              onClick={doCheckUpdates}
              disabled={checking}
              className="btn w-full"
            >
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
              {checking ? "Checking…" : "Check for updates"}
            </button>
          </div>
        </div>
      )}

      {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}
      {exportScope && (
        <Modal title="What should the bundle hold?" onClose={() => setExportScope(false)}>
          <div className="flex flex-col gap-2">
            <button
              className="btn w-full"
              disabled={!activeWorkspace}
              onClick={() => void doExport("workspace")}
            >
              This workspace
            </button>
            <p className="mb-2 text-[11px] leading-snug text-[var(--text-dim)]">
              {activeWorkspace?.name ?? "—"} and its boards. Importing it
              anywhere adds a workspace without touching what is already there.
            </p>
            <button className="btn w-full" onClick={() => void doExport("all")}>
              Everything
            </button>
            <p className="text-[11px] leading-snug text-[var(--text-dim)]">
              Every workspace on this device — a full backup. Importing it
              replaces everything.
            </p>
          </div>
        </Modal>
      )}
      {pendingAll && (
        <ConfirmModal
          title="Replace everything?"
          message="This bundle is a whole-device backup. Importing it deletes every workspace, board, image and note here and replaces them with its contents."
          confirmLabel="Replace"
          onConfirm={() => void applyPendingAll()}
          onClose={() => setPendingAll(null)}
        />
      )}
    </div>
  );
}
