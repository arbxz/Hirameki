use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use uuid::Uuid;

// Audio ingestion mirrors images.rs: persist user-added sound files to a fixed,
// scoped location under the app data dir. The DB stores the relative path
// ("audio/<uuid>.<ext>"); the frontend resolves it to an asset URL for the
// <audio> element. Remote stream URLs are played directly and never land here.

const AUDIO_SUBDIR: &str = "audio";

fn audio_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join(AUDIO_SUBDIR);
    fs::create_dir_all(&dir).map_err(|e| format!("create audio dir: {e}"))?;
    Ok(dir)
}

fn sanitize_ext(ext: &str) -> String {
    let cleaned: String = ext
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    if cleaned.is_empty() {
        "mp3".to_string()
    } else {
        cleaned
    }
}

/// Persist raw audio bytes (from a picked/dropped file) and return the relative
/// path to store in the DB.
#[tauri::command]
pub fn save_audio(app: AppHandle, bytes: Vec<u8>, ext: String) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty audio".into());
    }
    let ext = sanitize_ext(&ext);
    let name = format!("{}.{}", Uuid::new_v4(), ext);
    let path = audio_dir(&app)?.join(&name);
    fs::write(&path, &bytes).map_err(|e| format!("write audio: {e}"))?;
    Ok(format!("{AUDIO_SUBDIR}/{name}"))
}
