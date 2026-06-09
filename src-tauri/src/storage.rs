use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use uuid::Uuid;

// Shared binary-asset storage for images.rs and audio.rs: write user-supplied
// bytes to a fixed, scoped subdir under the app data dir and return the relative
// path ("<subdir>/<uuid>.<ext>") the DB stores. The frontend resolves that path
// to an asset URL at render via convertFileSrc.

/// Normalize a user/MIME-supplied extension to a safe lowercase token, falling
/// back to `default_ext` when nothing usable remains.
pub fn sanitize_ext(ext: &str, default_ext: &str) -> String {
    let cleaned: String = ext
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    if cleaned.is_empty() {
        default_ext.to_string()
    } else {
        cleaned
    }
}

/// Resolve (creating if needed) a subdirectory under the app data dir.
fn subdir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("create {name} dir: {e}"))?;
    Ok(dir)
}

/// Persist `bytes` under `<app_data>/<subdir_name>/<uuid>.<ext>` and return the
/// relative path to store in the DB.
pub fn save_bytes(
    app: &AppHandle,
    subdir_name: &str,
    bytes: &[u8],
    ext: &str,
    default_ext: &str,
) -> Result<String, String> {
    let ext = sanitize_ext(ext, default_ext);
    let name = format!("{}.{}", Uuid::new_v4(), ext);
    let path = subdir(app, subdir_name)?.join(&name);
    fs::write(&path, bytes).map_err(|e| format!("write {subdir_name}: {e}"))?;
    Ok(format!("{subdir_name}/{name}"))
}
