use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use uuid::Uuid;

// Image ingestion lives in Rust so we can (a) write binaries to a fixed,
// scoped location under the app data dir and (b) download remote URLs without
// hitting browser CORS. The DB stores the *relative* path returned here
// ("images/<uuid>.<ext>"); the frontend resolves it to an asset URL at render.

const IMAGES_SUBDIR: &str = "images";

fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?
        .join(IMAGES_SUBDIR);
    fs::create_dir_all(&dir).map_err(|e| format!("create images dir: {e}"))?;
    Ok(dir)
}

/// Normalize a user/MIME-supplied extension to a safe lowercase token.
fn sanitize_ext(ext: &str) -> String {
    let cleaned: String = ext
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    if cleaned.is_empty() {
        "png".to_string()
    } else {
        cleaned
    }
}

fn write_image(app: &AppHandle, bytes: &[u8], ext: &str) -> Result<String, String> {
    let ext = sanitize_ext(ext);
    let name = format!("{}.{}", Uuid::new_v4(), ext);
    let path = images_dir(app)?.join(&name);
    fs::write(&path, bytes).map_err(|e| format!("write image: {e}"))?;
    Ok(format!("{IMAGES_SUBDIR}/{name}"))
}

/// Persist raw image bytes (from a dropped/uploaded/pasted file) and return the
/// relative path to store in the DB.
#[tauri::command]
pub fn save_image(app: AppHandle, bytes: Vec<u8>, ext: String) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty image".into());
    }
    write_image(&app, &bytes, &ext)
}

fn ext_from_content_type(ct: &str) -> Option<&'static str> {
    match ct.split(';').next().unwrap_or("").trim() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/svg+xml" => Some("svg"),
        "image/avif" => Some("avif"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        _ => None,
    }
}

fn ext_from_url(url: &str) -> Option<String> {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let last = path.rsplit('/').next().unwrap_or("");
    let ext = last.rsplit('.').next().unwrap_or("");
    if ext.is_empty() || ext == last {
        None
    } else {
        Some(sanitize_ext(ext))
    }
}

/// Download an image from a URL (bypassing CORS) and persist it. Returns the
/// relative path to store in the DB.
#[tauri::command]
pub async fn download_image(app: AppHandle, url: String) -> Result<String, String> {
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }

    let ct_ext = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(ext_from_content_type)
        .map(|s| s.to_string());

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read body: {e}"))?;

    let ext = ct_ext
        .or_else(|| ext_from_url(&url))
        .unwrap_or_else(|| "png".to_string());

    write_image(&app, &bytes, &ext)
}
