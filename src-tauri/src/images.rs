use std::time::Duration;

use tauri::AppHandle;

use crate::storage;

// Image ingestion lives in Rust so we can (a) write binaries to a fixed, scoped
// location under the app data dir (via storage::save_bytes) and (b) download
// remote URLs without hitting browser CORS. The DB stores the *relative* path
// returned here ("images/<uuid>.<ext>"); the frontend resolves it to an asset
// URL at render.

const IMAGES_SUBDIR: &str = "images";

// Caps for remote downloads. Without these a slow or oversized URL could hang
// ingestion or exhaust memory (the body is buffered in full before writing).
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_REDIRECTS: usize = 5;
const MAX_IMAGE_BYTES: usize = 64 * 1024 * 1024; // 64 MiB

/// Persist raw image bytes (from a dropped/uploaded/pasted file) and return the
/// relative path to store in the DB.
#[tauri::command]
pub fn save_image(app: AppHandle, bytes: Vec<u8>, ext: String) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty image".into());
    }
    storage::save_bytes(&app, IMAGES_SUBDIR, &bytes, &ext, "png")
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
        Some(storage::sanitize_ext(ext, "png"))
    }
}

/// Download an image from a URL (bypassing CORS) and persist it. Returns the
/// relative path to store in the DB. Enforces a timeout, a redirect limit, and a
/// size cap so a hostile or broken URL can't hang or exhaust memory.
#[tauri::command]
pub async fn download_image(app: AppHandle, url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(DOWNLOAD_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .build()
        .map_err(|e| format!("client build: {e}"))?;

    let mut resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Reject obvious non-images up front when the server declares a type.
    if let Some(ct) = &content_type {
        let main = ct.split(';').next().unwrap_or("").trim();
        if !main.is_empty() && !main.starts_with("image/") {
            return Err(format!("not an image (content-type: {main})"));
        }
    }

    // Honor Content-Length when present, then enforce the cap again while
    // streaming so an absent/lying header still can't blow past the limit.
    if let Some(len) = resp.content_length() {
        if len as usize > MAX_IMAGE_BYTES {
            return Err(format!("image too large: {len} bytes"));
        }
    }

    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("read body: {e}"))?
    {
        if bytes.len() + chunk.len() > MAX_IMAGE_BYTES {
            return Err("image too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("empty download".into());
    }

    let ext = content_type
        .as_deref()
        .and_then(ext_from_content_type)
        .map(|s| s.to_string())
        .or_else(|| ext_from_url(&url))
        .unwrap_or_else(|| "png".to_string());

    storage::save_bytes(&app, IMAGES_SUBDIR, &bytes, &ext, "png")
}
