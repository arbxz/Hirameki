import { useRef, useState } from "react";
import { Image as ImageIcon, Link, Trash2, Upload, X } from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import { saveFile } from "../lib/images";
import { looksLikeUrl } from "../lib/assets";
import type { Board } from "../types/board";

// Modal for the per-board fixed background: add via upload or link, choose
// cover/contain, or remove. Applies to the given board (the active one).

export function BackgroundModal({
  board,
  onClose,
}: {
  board: Board;
  onClose: () => void;
}) {
  const setBoardBackground = useBoardStore((s) => s.setBoardBackground);
  const setError = useBoardStore((s) => s.setError);

  const [fit, setFit] = useState<"cover" | "contain">(board.bgFit);
  const [urlInput, setUrlInput] = useState(board.bgUrl ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasBackground = !!(board.bgPath || board.bgUrl);

  const applyFit = (next: "cover" | "contain") => {
    setFit(next);
    // Live-update fit if a background is already set.
    if (board.bgPath || board.bgUrl) {
      void setBoardBackground(
        board.id,
        board.bgPath ? { filePath: board.bgPath } : { url: board.bgUrl },
        next,
      );
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const path = await saveFile(file);
      await setBoardBackground(board.id, { filePath: path }, fit);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const onApplyUrl = async () => {
    const u = urlInput.trim();
    if (!looksLikeUrl(u)) return;
    setBusy(true);
    try {
      // Link backgrounds are referenced directly (not downloaded) so animated
      // gifs stream from their source and bundles stay small.
      await setBoardBackground(board.id, { url: u }, fit);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      await setBoardBackground(board.id, null, fit);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ui-chrome fixed inset-0 z-[4000] grid place-items-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-80 rounded-xl bg-[var(--surface-solid)] p-5 text-[var(--text)] shadow-2xl ring-1 ring-[var(--border)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <ImageIcon size={15} /> Board background
          </h2>
          <button
            className="grid h-6 w-6 place-items-center rounded text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        {/* fit */}
        <label className="mb-1.5 block text-[11px] text-[var(--text-dim)]">
          Fit
        </label>
        <div className="mb-4 flex gap-1.5">
          {(["cover", "contain"] as const).map((f) => (
            <button
              key={f}
              onClick={() => applyFit(f)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs capitalize ring-1 ${
                fit === f
                  ? "bg-[var(--accent)]/20 ring-[var(--accent)]"
                  : "ring-[var(--border)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* source */}
        <label className="mb-1.5 block text-[11px] text-[var(--text-dim)]">
          Image / GIF
        </label>
        <button
          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-hover)] px-2 py-1.5 text-xs hover:opacity-80 disabled:opacity-40"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={14} /> Upload file
        </button>
        <div className="flex gap-1.5">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void onApplyUrl()}
            placeholder="Paste image/GIF link"
            className="min-w-0 flex-1 rounded-lg bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
          <button
            className="grid place-items-center rounded-lg bg-[var(--surface-hover)] px-2.5 hover:opacity-80 disabled:opacity-40"
            onClick={() => void onApplyUrl()}
            disabled={busy || !looksLikeUrl(urlInput)}
            title="Use link"
          >
            <Link size={14} />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPickFile(e)}
        />

        {hasBackground && (
          <button
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/15 disabled:opacity-40"
            onClick={() => void onRemove()}
            disabled={busy}
          >
            <Trash2 size={14} /> Remove background
          </button>
        )}
      </div>
    </div>
  );
}
