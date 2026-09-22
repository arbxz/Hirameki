import { useEffect } from "react";
import { Canvas } from "./components/Canvas";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import { Toaster } from "./components/Toaster";
import { installSelectionGuard } from "./lib/preventSelection";
import { checkForUpdates } from "./lib/updater";

function App() {
  // Suppress drag-to-highlight across the whole app.
  useEffect(() => installSelectionGuard(), []);

  // Quietly check for updates on launch; only surfaces a prompt if one exists.
  useEffect(() => {
    void checkForUpdates({ silent: true });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {/* `relative` so the canvas overlays (toolbar, settings) anchor
          below the title bar instead of the viewport top. */}
      <div className="relative min-h-0 flex-1">
        <Canvas />
        <SettingsPanel />
        {/* Errors, undo prompts and progress all surface here. */}
        <Toaster />
      </div>
    </div>
  );
}

export default App;
