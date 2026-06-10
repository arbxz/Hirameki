import { useEffect } from "react";
import { Canvas } from "./components/Canvas";
import { BoardTabs } from "./components/BoardTabs";
import { MusicWidget } from "./components/MusicWidget";
import { SettingsPanel } from "./components/SettingsPanel";
import { useBoardStore } from "./store/boardStore";
import { installSelectionGuard } from "./lib/preventSelection";

function App() {
  const error = useBoardStore((s) => s.error);

  // Suppress drag-to-highlight across the whole app.
  useEffect(() => installSelectionGuard(), []);

  return (
    <>
      <Canvas />
      <BoardTabs />
      <MusicWidget />
      <SettingsPanel />
      {error && (
        <div className="fixed bottom-4 left-1/2 max-w-md -translate-x-1/2 rounded-lg bg-red-900/90 px-3 py-2 text-xs text-red-100 shadow-lg ring-1 ring-red-500/40">
          {error}
        </div>
      )}
    </>
  );
}

export default App;
