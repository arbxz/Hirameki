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
    /// Bundle format. Absent in files written before workspaces existed, which
    /// `serde(default)` reports as 0 so the JS side can recognise them.
    #[serde(default)]
    version: u32,
    /// "workspace" or "all". Absent in pre-workspaces files.
    #[serde(default)]
    scope: Option<String>,
    manifest: String,
    assets: HashMap<String, String>, // relative path -> base64 bytes
}

/// What `import_data` hands back: everything except the (already restored)
/// assets, so the JS side can see which kind of bundle it is before applying it.
#[derive(Serialize)]
struct BundleHead {
    version: u32,
    scope: Option<String>,
    manifest: String,
}

/// Asset keys come from the bundle file, which is untrusted input, and are
/// joined onto the app data dir. Without this a crafted bundle could use
/// `../` or an absolute path to write anywhere the app can write.
fn safe_relative(rel: &str) -> bool {
    let p = std::path::Path::new(rel);
    !p.is_absolute()
        && !rel.contains(':')
        && p.components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
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
    version: u32,
    scope: String,
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
    let asset_count = assets.len();
    let bundle = Bundle {
        version,
        scope: Some(scope),
        manifest,
        assets,
    };
    let json = serde_json::to_string(&bundle).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&out_path, json).map_err(|e| {
        log::error!("export_data write failed ({out_path}): {e}");
        format!("write bundle: {e}")
    })?;
    log::info!("export_data wrote {asset_count} assets to {out_path}");
    Ok(())
}

/// Read a bundle file: restore its assets into the app data dir and return the
/// version, scope and manifest for the JS layer to apply to the database.
#[tauri::command]
pub fn import_data(app: AppHandle, in_path: String) -> Result<String, String> {
    let base = app_data(&app)?;
    let raw = fs::read_to_string(&in_path).map_err(|e| {
        log::error!("import_data read failed ({in_path}): {e}");
        format!("read bundle: {e}")
    })?;
    let bundle: Bundle = serde_json::from_str(&raw).map_err(|e| {
        log::error!("import_data parse failed ({in_path}): {e}");
        format!("parse bundle: {e}")
    })?;
    let asset_count = bundle.assets.len();
    for (rel, b64) in bundle.assets {
        if !safe_relative(&rel) {
            log::error!("import_data rejected asset path: {rel}");
            return Err(format!("unsafe asset path in bundle: {rel}"));
        }
        let p = base.join(&rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
        }
        let bytes = STANDARD
            .decode(b64)
            .map_err(|e| format!("decode asset {rel}: {e}"))?;
        fs::write(&p, bytes).map_err(|e| format!("write asset {rel}: {e}"))?;
    }
    log::info!("import_data restored {asset_count} assets from {in_path}");
    let head = BundleHead {
        version: bundle.version,
        scope: bundle.scope,
        manifest: bundle.manifest,
    };
    serde_json::to_string(&head).map_err(|e| format!("serialize head: {e}"))
}
