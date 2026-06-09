import { create } from "zustand";
import defaultTrackUrl from "../assets/fassounds-good-night-lofi-cozy-chill-music-160166.mp3";
import { resolveAudioSrc, saveAudioFile } from "../lib/audio";
import { getSetting, setSetting } from "../lib/settings";
import {
  createTrack as repoCreateTrack,
  deleteTrack as repoDeleteTrack,
  listTracks,
  type Track,
} from "../lib/tracks";

// Background-music engine. Wraps a single HTMLAudioElement, owns the playlist
// (a bundled default track + user-added files/URLs), and persists play/mute/
// volume/current-track to the settings table so the next launch can restore.
//
// Autoplay policy (user decision): start playing on launch, but remember the
// last play/mute state. Webviews block real autoplay until a user gesture, so
// if the persisted state was "playing" we attempt play immediately and, if the
// browser refuses, retry once on the first user interaction.

// The bundled default track is represented as a synthetic Track whose src is
// the Vite-resolved asset URL, so it needs no DB row.
export const DEFAULT_TRACK: Track = {
  id: "__default__",
  title: "Good Night Lofi — FASSounds",
  filePath: null,
  srcUrl: defaultTrackUrl,
  createdAt: 0,
};

const SK = {
  playing: "music.playing",
  muted: "music.muted",
  volume: "music.volume",
  current: "music.currentTrackId",
} as const;

interface MusicState {
  tracks: Track[]; // includes DEFAULT_TRACK at index 0
  currentId: string;
  playing: boolean;
  muted: boolean;
  volume: number; // 0..1
  ready: boolean;

  init: () => Promise<void>;
  togglePlay: () => void;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  selectTrack: (id: string) => void;
  addFile: (file: File) => Promise<void>;
  addUrl: (url: string, title?: string) => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
}

// Single shared audio element for the whole app.
const audio = new Audio();
audio.loop = true;

// Guards against a second init() (React StrictMode mounts effects twice in dev),
// which would otherwise re-arm autoplay and reload the track element.
let initStarted = false;

export const useMusicStore = create<MusicState>((set, get) => {
  // Resolve a track to a playable URL (asset URL for files, direct for URLs).
  const srcFor = async (t: Track): Promise<string> => {
    if (t.srcUrl) return t.srcUrl;
    if (t.filePath) return resolveAudioSrc(t.filePath);
    return "";
  };

  // Load a track into the element and (optionally) play. Returns whether play
  // succeeded, so callers can arm the first-interaction fallback.
  const load = async (t: Track, play: boolean): Promise<boolean> => {
    const url = await srcFor(t);
    if (audio.src !== url) audio.src = url;
    if (!play) return false;
    try {
      await audio.play();
      return true;
    } catch {
      return false; // autoplay blocked
    }
  };

  // Retry play once on the first user gesture if autoplay was blocked.
  const armAutoplayFallback = () => {
    const onGesture = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      if (get().playing) void audio.play().catch(() => {});
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
  };

  audio.addEventListener("play", () => set({ playing: true }));
  audio.addEventListener("pause", () => set({ playing: false }));

  return {
    tracks: [DEFAULT_TRACK],
    currentId: DEFAULT_TRACK.id,
    playing: false,
    muted: false,
    volume: 0.5,
    ready: false,

    async init() {
      if (initStarted) return;
      initStarted = true;
      const [userTracks, sPlaying, sMuted, sVolume, sCurrent] =
        await Promise.all([
          listTracks(),
          getSetting(SK.playing),
          getSetting(SK.muted),
          getSetting(SK.volume),
          getSetting(SK.current),
        ]);

      const tracks = [DEFAULT_TRACK, ...userTracks];
      const volume = sVolume != null ? Number(sVolume) : 0.5;
      const muted = sMuted === "true";
      // First launch (no stored state) defaults to playing.
      const playing = sPlaying == null ? true : sPlaying === "true";
      const currentId =
        sCurrent && tracks.some((t) => t.id === sCurrent)
          ? sCurrent
          : DEFAULT_TRACK.id;

      audio.volume = volume;
      audio.muted = muted;
      set({ tracks, currentId, playing, muted, volume, ready: true });

      const current = tracks.find((t) => t.id === currentId) ?? DEFAULT_TRACK;
      if (playing) {
        const ok = await load(current, true);
        if (!ok) armAutoplayFallback();
      } else {
        await load(current, false);
      }
    },

    togglePlay() {
      const next = !get().playing;
      set({ playing: next });
      void setSetting(SK.playing, String(next));
      if (next) void audio.play().catch(() => {});
      else audio.pause();
    },

    setMuted(m) {
      audio.muted = m;
      set({ muted: m });
      void setSetting(SK.muted, String(m));
    },

    setVolume(v) {
      const vol = Math.min(1, Math.max(0, v));
      audio.volume = vol;
      // Adjusting volume off zero implicitly unmutes.
      if (vol > 0 && get().muted) {
        audio.muted = false;
        set({ muted: false });
        void setSetting(SK.muted, "false");
      }
      set({ volume: vol });
      void setSetting(SK.volume, String(vol));
    },

    selectTrack(id) {
      const t = get().tracks.find((x) => x.id === id);
      if (!t) return;
      set({ currentId: id });
      void setSetting(SK.current, id);
      void load(t, get().playing);
    },

    async addFile(file) {
      const path = await saveAudioFile(file);
      const title = file.name.replace(/\.[^.]+$/, "");
      const track = await repoCreateTrack(title, { filePath: path });
      set({ tracks: [...get().tracks, track] });
      get().selectTrack(track.id);
    },

    async addUrl(url, title) {
      const track = await repoCreateTrack(title?.trim() || url, {
        srcUrl: url,
      });
      set({ tracks: [...get().tracks, track] });
      get().selectTrack(track.id);
    },

    async removeTrack(id) {
      if (id === DEFAULT_TRACK.id) return; // can't remove the bundled track
      set({ tracks: get().tracks.filter((t) => t.id !== id) });
      if (get().currentId === id) get().selectTrack(DEFAULT_TRACK.id);
      await repoDeleteTrack(id);
    },
  };
});
