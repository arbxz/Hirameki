// Domain types mirroring the SQLite schema (see src-tauri/migrations/001_init.sql).
// DB columns are snake_case; these app-facing types are camelCase. The db layer
// is responsible for mapping between the two.

export interface Board {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  viewX: number;
  viewY: number;
  viewZoom: number;
  /** Optional color tag shown on the board's folder tab. */
  color: string | null;
  /** Tab order; lower is further left. */
  position: number;
  /** Imported background file (relative path under app images dir), or null. */
  bgPath: string | null;
  /** Remote background image/gif URL, or null. */
  bgUrl: string | null;
  /** How the background fills the viewport. */
  bgFit: "cover" | "contain";
}

export interface Group {
  id: string;
  boardId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
  z: number;
  createdAt: number;
}

export interface Item {
  id: string;
  boardId: string;
  groupId: string | null;
  /** Relative path under the app images dir, or null for a not-yet-saved item. */
  filePath: string | null;
  /** Original URL when the image was added from a link. */
  srcUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  naturalW: number | null;
  naturalH: number | null;
  createdAt: number;
}
