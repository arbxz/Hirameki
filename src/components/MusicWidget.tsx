import { useEffect, useRef, useState } from "react";
import { FilePlus, Music, Pause, Play, Plus, Volume2, VolumeX, X } from "lucide-react";
import { DEFAULT_TRACK, useMusicStore } from "../store/musicStore";
import { looksLikeUrl } from "../lib/audio";

// Background-music widget (bottom-left, ui-chrome so Selecto ignores it).
// Collapsed: play/pause + mute. Expanded: volume, track list, add file/URL,
// and the required attribution.

export function MusicWidget() {
  const {
    tracks,
    currentId,
    playing,
    muted,
    volume,
    ready,
    init,
    togglePlay,
    setMuted,
    setVolume,
    selectTrack,
    addFile,
    addUrl,
    removeTrack,
  } = useMusicStore();

  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return null;

  const current = tracks.find((t) => t.id === currentId) ?? DEFAULT_TRACK;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void addFile(file);
  };

  const onAddUrl = () => {
    const u = urlInput.trim();
    if (looksLikeUrl(u)) {
      void addUrl(u);
      setUrlInput("");
    }
  };

  return (
    <div className="ui-chrome absolute bottom-4 left-4 text-[var(--text)]">
      {open && (
        <div className="mb-2 w-72 rounded-xl bg-[var(--surface)] p-3 shadow-2xl ring-1 ring-[var(--border)] backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Music size={14} /> Music
            </span>
            <button
              className="grid h-6 w-6 place-items-center rounded text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
              onClick={() => setOpen(false)}
              title="Collapse"
            >
              <X size={14} />
            </button>
          </div>

          {/* volume */}
          <label className="mb-3 flex items-center gap-2 text-xs text-[var(--text-dim)]">
            <Volume2 size={14} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
            />
          </label>

          {/* track list */}
          <div className="mb-2 max-h-40 space-y-0.5 overflow-y-auto">
            {tracks.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center gap-1 rounded px-2 py-1 text-xs ${
                  t.id === currentId
                    ? "bg-[var(--accent)]/20"
                    : "hover:bg-[var(--surface-hover)]"
                }`}
              >
                <button
                  className="flex flex-1 items-center gap-1 truncate text-left"
                  onClick={() => selectTrack(t.id)}
                  title={t.title}
                >
                  {t.id === currentId && playing && (
                    <Play size={11} className="shrink-0" />
                  )}
                  <span className="truncate">{t.title}</span>
                </button>
                {t.id !== DEFAULT_TRACK.id && (
                  <button
                    className="hidden rounded p-0.5 text-red-400 hover:bg-red-500/20 group-hover:block"
                    onClick={() => void removeTrack(t.id)}
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* add file / url */}
          <div className="space-y-1.5">
            <button
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-hover)] px-2 py-1 text-xs hover:opacity-80"
              onClick={() => fileRef.current?.click()}
            >
              <FilePlus size={14} /> Add audio file
            </button>
            <div className="flex gap-1">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddUrl()}
                placeholder="Paste audio URL"
                className="min-w-0 flex-1 rounded-lg bg-[var(--surface-solid)] px-2 py-1 text-xs text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              <button
                className="grid place-items-center rounded-lg bg-[var(--surface-hover)] px-2 hover:opacity-80 disabled:opacity-40"
                onClick={onAddUrl}
                disabled={!looksLikeUrl(urlInput)}
                title="Add URL"
              >
                <Plus size={14} />
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={onPickFile}
            />
          </div>

          {/* attribution */}
          <p className="mt-3 text-[10px] leading-snug text-[var(--text-dim)]">
            Music by{" "}
            <a
              className="underline hover:text-[var(--text)]"
              href="https://pixabay.com/users/fassounds-3433550/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=160166"
              target="_blank"
              rel="noreferrer"
            >
              FASSounds
            </a>{" "}
            from{" "}
            <a
              className="underline hover:text-[var(--text)]"
              href="https://pixabay.com/music//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=160166"
              target="_blank"
              rel="noreferrer"
            >
              Pixabay
            </a>
          </p>
        </div>
      )}

      {/* collapsed control bar */}
      <div className="flex items-center gap-1 rounded-lg bg-[var(--surface)] p-1 shadow-lg ring-1 ring-[var(--border)] backdrop-blur">
        <button
          className="grid h-8 w-8 place-items-center rounded hover:bg-[var(--surface-hover)]"
          onClick={togglePlay}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded hover:bg-[var(--surface-hover)]"
          onClick={() => setMuted(!muted)}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button
          className="flex max-w-32 items-center gap-1 truncate rounded px-2 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
          onClick={() => setOpen((o) => !o)}
          title={current.title}
        >
          <Music size={13} className="shrink-0" />
          <span className="truncate">{current.title}</span>
        </button>
      </div>
    </div>
  );
}
