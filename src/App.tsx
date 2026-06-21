import { useEffect } from "react";
import { Canvas } from "./components/Canvas";
import { MusicWidget } from "./components/MusicWidget";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import { useBoardStore } from "./store/boardStore";
import { installSelectionGuard } from "./lib/preventSelection";
import { checkForUpdates } from "./lib/updater";

function App() {
  const error = useBoardStore((s) => s.error);

  // Suppress drag-to-highlight across the whole app.
  useEffect(() => installSelectionGuard(), []);

  // Quietly check for updates on launch; only surfaces a prompt if one exists.
  useEffect(() => {
    void checkForUpdates({ silent: true });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {/* `relative` so the canvas overlays (toolbar, settings, music) anchor
          below the title bar instead of the viewport top. */}
      <div className="relative min-h-0 flex-1">
        <Canvas />
        <MusicWidget />
        <SettingsPanel />
        {error && (
          <div className="fixed bottom-4 left-1/2 max-w-md -translate-x-1/2 rounded-lg bg-red-900/90 px-3 py-2 text-xs text-red-100 shadow-lg ring-1 ring-red-500/40">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
