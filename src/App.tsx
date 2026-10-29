import { useEffect } from "react";
import { Canvas } from "./components/Canvas";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import { Toaster } from "./components/Toaster";
import { OnboardingTour } from "./components/OnboardingTour";
import { useOnboardingStore } from "./store/onboardingStore";
import { useWorkspaceStore } from "./store/workspaceStore";
import { installSelectionGuard } from "./lib/preventSelection";
import { checkForUpdates } from "./lib/updater";

function App() {
  // Suppress drag-to-highlight across the whole app.
  useEffect(() => installSelectionGuard(), []);

  // One entry point: the workspace store resolves which workspace to open, then
  // loads its boards and its appearance. Boards and theme no longer init
  // themselves, because neither knows which workspace it belongs to.
  const initWorkspaces = useWorkspaceStore((w) => w.init);
  useEffect(() => {
    void initWorkspaces();
  }, [initWorkspaces]);

  // Opens the tour on a machine that has never run it.
  const initTour = useOnboardingStore((t) => t.init);
  useEffect(() => {
    void initTour();
  }, [initTour]);

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
        {/* First run only; replayable from Settings. */}
        <OnboardingTour />
      </div>
    </div>
  );
}

export default App;
