import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";

// Self-update flow. `check()` hits the endpoint configured in tauri.conf.json
// (plugins.updater.endpoints) and verifies the manifest signature against the
// embedded public key. If a newer version is offered, we ask the user, then
// download + install and relaunch.
//
// `silent` = startup check: stay quiet unless an update is actually found.
// Non-silent = the "Check for updates" button: always report the outcome.

export async function checkForUpdates({ silent }: { silent: boolean }): Promise<void> {
  let update;
  try {
    update = await check();
  } catch (e) {
    // Offline, placeholder endpoint, or signature mismatch.
    if (!silent) {
      await message(`Couldn't check for updates.\n\n${String(e)}`, {
        title: "Update check failed",
        kind: "error",
      });
    }
    return;
  }

  if (!update) {
    if (!silent) {
      await message("You're running the latest version.", {
        title: "No updates available",
      });
    }
    return;
  }

  const proceed = await ask(
    `Hirameki ${update.version} is available — you have ${update.currentVersion}.` +
      (update.body ? `\n\n${update.body}` : "") +
      `\n\nDownload and install now? The app will restart.`,
    { title: "Update available", kind: "info" },
  );
  if (!proceed) return;

  await update.downloadAndInstall();
  await relaunch();
}
