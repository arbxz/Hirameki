import { v4 as uuid } from "uuid";
import { getDb } from "./db";

// Data-access for the `tracks` table (user-added background-music sources).
// Kept separate from repo.ts (board items) since it's an unrelated concern.

export interface Track {
  id: string;
  title: string;
  /** Relative path under the app audio dir, for an imported file. */
  filePath: string | null;
  /** Remote stream URL, played directly. */
  srcUrl: string | null;
  createdAt: number;
}

interface TrackRow {
  id: string;
  title: string;
  file_path: string | null;
  src_url: string | null;
  created_at: number;
}

const toTrack = (r: TrackRow): Track => ({
  id: r.id,
  title: r.title,
  filePath: r.file_path,
  srcUrl: r.src_url,
  createdAt: r.created_at,
});

export async function listTracks(): Promise<Track[]> {
  const db = await getDb();
  const rows = await db.select<TrackRow[]>(
    "SELECT * FROM tracks ORDER BY created_at ASC",
  );
  return rows.map(toTrack);
}

export async function createTrack(
  title: string,
  source: { filePath?: string; srcUrl?: string },
): Promise<Track> {
  const db = await getDb();
  const track: Track = {
    id: uuid(),
    title,
    filePath: source.filePath ?? null,
    srcUrl: source.srcUrl ?? null,
    createdAt: Date.now(),
  };
  await db.execute(
    `INSERT INTO tracks (id, title, file_path, src_url, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [track.id, track.title, track.filePath, track.srcUrl, track.createdAt],
  );
  return track;
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM tracks WHERE id = $1", [id]);
}
