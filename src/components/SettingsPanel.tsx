import { useEffect, useRef, useState } from "react";
import {
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
import { exportBundle, importBundle } from "../lib/exportImport";
import { useBoardStore } from "../store/boardStore";
import { checkForUpdates } from "../lib/updater";
import { ShortcutsModal } from "./ShortcutsModal";
import { ConfirmModal } from "./Modal";

// Settings panel (top-right, ui-chrome). Theme presets + a custom color editor,
// plus full-board export/import. Mostly themes the background and UI chrome.

const TOKEN_LABELS: Record<keyof Theme, string> = {
  bg: "Background",
  grid: "Grid dots",
  surface: "Panel",
  surfaceSolid: "Panel (solid)",
  surfaceHover: "Hover",
  border: "Border",
  text: "Text",
  textDim: "Text (dim)",
  accent: "Accent",
  shadow: "Shadow",
};

// A token may hold rgba(); <input type=color> needs #rrggbb. Show a usable hex
// fallback and pass whatever the picker returns straight through.
function hexForPicker(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#888888";
}

export function SettingsPanel() {
  const { name, custom, init, selectPreset, setCustomToken } = useThemeStore();
  const setError = useBoardStore((s) => s.setError);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [checking, setChecking] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
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

  useEffect(() => {
    void init();
  }, [init]);

  const doExport = async () => {
    setBusy("export");
    try {
      await exportBundle();
    } catch (e) {
      setError(`Export failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    setBusy("import");
    try {
      await importBundle(); // reloads on success
    } catch (e) {
      setError(`Import failed: ${String(e)}`);
      setBusy(null);
    }
  };

  const addNote = useBoardStore((s) => s.addNote);

  return (
    <div className="ui-chrome absolute right-4 top-4 flex flex-col items-end gap-2">
      <button
        className="grid h-10 w-10 place-items-center rounded-[3px] bg-[var(--surface)] text-[var(--text)] shadow-lg ring-1 ring-[var(--border)] backdrop-blur hover:bg-[var(--surface-hover)]"
        onClick={() => void addNote()}
        aria-label="Add note"
        title="Add note"
      >
        <StickyNote size={16} />
      </button>
      <button
        ref={toggleRef}
        className="grid h-10 w-10 place-items-center rounded-[3px] bg-[var(--surface)] text-[var(--text)] shadow-lg ring-1 ring-[var(--border)] backdrop-blur hover:bg-[var(--surface-hover)]"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close settings" : "Settings"}
        aria-expanded={open}
        title="Settings"
      >
        {open ? <X size={16} /> : <Settings size={16} />}
      </button>

      {open && (
        <div className="chrome w-72 p-3 text-[var(--text)]">
          {/* themes */}
          <div className="ui-label mb-1 flex items-center gap-1.5">
            <Palette size={14} /> Theme
          </div>
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {Object.entries(PRESETS).map(([presetName, theme]) => (
              <button
                key={presetName}
                onClick={() => selectPreset(presetName)}
                aria-pressed={name === presetName}
                className={`flex flex-col items-center gap-1 rounded-[3px] p-2 ring-1 ${
                  name === presetName
                    ? "ring-[var(--accent)]"
                    : "ring-[var(--border)] hover:bg-[var(--surface-hover)]"
                }`}
                title={presetName}
              >
                <span
                  className="h-6 w-full rounded"
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
                      className="w-28 rounded bg-[var(--surface-solid)] px-1.5 py-0.5 text-[10px] text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                    />
                    <input
                      type="color"
                      value={hexForPicker(custom[token])}
                      aria-label={`${TOKEN_LABELS[token]} colour picker`}
                      onChange={(e) => setCustomToken(token, e.target.value)}
                      className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                  </span>
                </label>
              ))}
            </div>
          </details>

          {/* export / import */}
          <div className="border-t border-[var(--border)] pt-3">
            <div className="ui-label mb-1.5">Board data</div>
            <div className="flex gap-1.5">
              <button
                onClick={doExport}
                disabled={busy !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[3px] bg-[var(--surface-hover)] px-2 py-1.5 text-xs hover:opacity-80 disabled:opacity-40"
              >
                <Download size={14} />
                {busy === "export" ? "Exporting…" : "Export"}
              </button>
              <button
                // Import wipes every board before restoring, so it asks first.
                onClick={() => setConfirmImport(true)}
                disabled={busy !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[3px] bg-[var(--surface-hover)] px-2 py-1.5 text-xs hover:opacity-80 disabled:opacity-40"
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
            <div className="ui-label mb-1.5">App</div>
            <button
              onClick={() => setShortcuts(true)}
              className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-[var(--surface-hover)] px-2 py-1.5 text-xs hover:opacity-80"
            >
              <Keyboard size={14} />
              Keyboard shortcuts
            </button>
            <button
              onClick={doCheckUpdates}
              disabled={checking}
              className="flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-[var(--surface-hover)] px-2 py-1.5 text-xs hover:opacity-80 disabled:opacity-40"
            >
              <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
              {checking ? "Checking…" : "Check for updates"}
            </button>
          </div>
        </div>
      )}

      {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}
      {confirmImport && (
        <ConfirmModal
          title="Replace all boards?"
          message="Importing deletes every board, image and note on this device and replaces them with the bundle's contents. Export first if you want a backup."
          confirmLabel="Choose file…"
          onConfirm={() => {
            setConfirmImport(false);
            void doImport();
          }}
          onClose={() => setConfirmImport(false)}
        />
      )}
    </div>
  );
}
