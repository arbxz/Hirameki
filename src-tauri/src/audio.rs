use tauri::AppHandle;

use crate::storage;

// Audio ingestion mirrors images.rs: persist user-added sound files to a fixed,
// scoped location under the app data dir (via storage::save_bytes). The DB
// stores the relative path ("audio/<uuid>.<ext>"); the frontend resolves it to
// an asset URL for the <audio> element. Remote stream URLs are played directly
// and never land here.

const AUDIO_SUBDIR: &str = "audio";

/// Persist raw audio bytes (from a picked/dropped file) and return the relative
/// path to store in the DB.
#[tauri::command]
pub fn save_audio(app: AppHandle, bytes: Vec<u8>, ext: String) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty audio".into());
    }
    storage::save_bytes(&app, AUDIO_SUBDIR, &bytes, &ext, "mp3")
}
