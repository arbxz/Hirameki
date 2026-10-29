import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "./Modal";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { Workspace } from "../lib/workspaces";

// Create or rename a workspace. Deliberately just a name: a workspace is
// identified by what you call it, and the colour tagging that boards have would
// compete with the board tags sitting right next to it in the toolbar.

export function WorkspaceModal({
  mode,
  current,
  onClose,
}: {
  mode: "create" | "rename";
  current: Workspace | null;
  onClose: () => void;
}) {
  const create = useWorkspaceStore((w) => w.create);
  const rename = useWorkspaceStore((w) => w.rename);

  const [name, setName] = useState(mode === "rename" ? (current?.name ?? "") : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const title = mode === "create" ? "New workspace" : "Rename workspace";

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === "create") void create(trimmed);
    else if (current) void rename(current.id, trimmed);
    onClose();
  };

  return (
    <Modal title={title} onClose={onClose}>
      <label htmlFor={nameId} className="ui-label mb-1 block">
        Name
      </label>
      <input
        id={nameId}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Workspace name"
        className="mb-2 w-full bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--line-strong)] focus:ring-[var(--accent)]"
      />
      <p className="mb-5 text-[11px] leading-snug text-[var(--text-dim)]">
        {mode === "create"
          ? "A new workspace starts with one empty board and its own appearance."
          : "Only the name changes; its boards stay where they are."}
      </p>

      <div className="flex justify-end gap-2">
        <button
          className="px-3 py-1.5 text-xs text-[var(--text-dim)]"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--bg)] hover:opacity-90"
          disabled={!name.trim()}
          onClick={submit}
        >
          {mode === "create" ? "Create" : "Rename"}
        </button>
      </div>
    </Modal>
  );
}
