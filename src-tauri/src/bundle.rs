use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// Export/import file handling. The DB rows travel as an opaque `manifest` string
// (built and applied by the JS sql layer); this module only deals with the
// bundle file and the binary assets it embeds. Runs in Rust so it can read/write
// arbitrary user-chosen paths without the webview fs ACL scope.

#[derive(Serialize, Deserialize)]
struct Bundle {
    manifest: String,
    assets: HashMap<String, String>, // relative path -> base64 bytes
}

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))
}

/// Write a bundle file containing the manifest JSON and every listed asset
/// (base64-encoded). Missing asset files are skipped rather than failing.
#[tauri::command]
pub fn export_data(
    app: AppHandle,
    out_path: String,
    manifest: String,
    asset_paths: Vec<String>,
) -> Result<(), String> {
    let base = app_data(&app)?;
    let mut assets = HashMap::new();
    for rel in asset_paths {
        let p = base.join(&rel);
        if let Ok(bytes) = fs::read(&p) {
            assets.insert(rel, STANDARD.encode(bytes));
        }
    }
    let bundle = Bundle { manifest, assets };
    let json = serde_json::to_string(&bundle).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&out_path, json).map_err(|e| format!("write bundle: {e}"))?;
    Ok(())
}

/// Read a bundle file: restore its assets into the app data dir and return the
/// manifest JSON for the JS layer to apply to the database.
#[tauri::command]
pub fn import_data(app: AppHandle, in_path: String) -> Result<String, String> {
    let base = app_data(&app)?;
    let raw = fs::read_to_string(&in_path).map_err(|e| format!("read bundle: {e}"))?;
    let bundle: Bundle = serde_json::from_str(&raw).map_err(|e| format!("parse bundle: {e}"))?;
    for (rel, b64) in bundle.assets {
        let p = base.join(&rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
        }
        let bytes = STANDARD
            .decode(b64)
            .map_err(|e| format!("decode asset {rel}: {e}"))?;
        fs::write(&p, bytes).map_err(|e| format!("write asset {rel}: {e}"))?;
    }
    Ok(bundle.manifest)
}
