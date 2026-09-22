import { useId, useRef, useState } from "react";
import { Link, Trash2, Upload } from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import { saveFile } from "../lib/images";
import { looksLikeUrl } from "../lib/assets";
import { Modal } from "./Modal";
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
  const fitLabelId = useId();
  const sourceLabelId = useId();

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
    <Modal title="Board background" onClose={onClose}>
      {/* fit */}
      <div
        id={fitLabelId}
        className="ui-label mb-1.5 block"
      >
        Fit
      </div>
      <div role="group" aria-labelledby={fitLabelId} className="mb-4 flex gap-1.5">
        {(["cover", "contain"] as const).map((f) => (
          <button
            key={f}
            onClick={() => applyFit(f)}
            aria-pressed={fit === f}
            className={`flex-1 rounded-[3px] px-2 py-1.5 text-xs capitalize ring-1 ${
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
      <div
        id={sourceLabelId}
        className="ui-label mb-1.5 block"
      >
        Image / GIF
      </div>
      <button
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-[var(--surface-hover)] px-2 py-1.5 text-xs hover:opacity-80 disabled:opacity-40"
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
          aria-label="Image or GIF link"
          aria-describedby={sourceLabelId}
          className="min-w-0 flex-1 rounded-[3px] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
        />
        <button
          className="grid place-items-center rounded-[3px] bg-[var(--surface-hover)] px-2.5 hover:opacity-80 disabled:opacity-40"
          onClick={() => void onApplyUrl()}
          disabled={busy || !looksLikeUrl(urlInput)}
          aria-label="Use this link as the background"
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
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[3px] px-2 py-1.5 text-xs text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/15 disabled:opacity-40"
          onClick={() => void onRemove()}
          disabled={busy}
        >
          <Trash2 size={14} /> Remove background
        </button>
      )}
    </Modal>
  );
}
