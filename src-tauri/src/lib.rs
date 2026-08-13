use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

mod audio;
mod bundle;
mod images;
mod storage;

/// Turn off WebView2's built-in pinch zoom.
///
/// WebView2 applies a touchpad/touchscreen pinch as "Page Scale" zoom — a
/// post-rendering step that scales the rendered surface and clips the viewport,
/// without ever dispatching an event to the page. That both looks wrong in a
/// canvas app (the whole chrome scales and content becomes unreachable) and
/// swallows the gesture, so the front end never sees it. Switching it off is
/// what lets the pinch reach JS as a ctrl+wheel event, which Canvas.tsx turns
/// into a real canvas zoom.
///
/// Not exposed by Tauri config, so we reach the setting through the raw
/// WebView2 controller. Failures are logged, never fatal: the app is fully
/// usable without it, just with no trackpad pinch.
#[cfg(windows)]
fn disable_webview_pinch_zoom(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings5;
    use windows::core::Interface;

    let result = window.with_webview(|webview| unsafe {
        let controller = webview.controller();
        let core = match controller.CoreWebView2() {
            Ok(c) => c,
            Err(e) => return log::warn!("pinch zoom: no CoreWebView2 ({e})"),
        };
        let settings = match core.Settings() {
            Ok(s) => s,
            Err(e) => return log::warn!("pinch zoom: no settings ({e})"),
        };
        // Settings5 is a newer interface; an older runtime simply won't have it.
        match settings.cast::<ICoreWebView2Settings5>() {
            Ok(s5) => {
                if let Err(e) = s5.SetIsPinchZoomEnabled(false) {
                    log::warn!("pinch zoom: set failed ({e})");
                }
            }
            Err(e) => log::warn!("pinch zoom: ICoreWebView2Settings5 unavailable ({e})"),
        }
    });
    if let Err(e) = result {
        log::warn!("pinch zoom: with_webview failed ({e})");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "settings_and_audio",
            sql: include_str!("../migrations/002_settings_audio.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "board_tabs",
            sql: include_str!("../migrations/003_board_tabs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "board_background",
            sql: include_str!("../migrations/004_board_background.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "notes",
            sql: include_str!("../migrations/005_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "note_font_size",
            sql: include_str!("../migrations/006_note_font_size.sql"),
            kind: MigrationKind::Up,
        },
    ];

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:inspo.db", migrations)
                .build(),
        );

    // Self-updater + process (relaunch after install) are desktop-only;
    // mobile stores handle their own updates.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .setup(|_app| {
            #[cfg(windows)]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    disable_webview_pinch_zoom(&window);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            images::save_image,
            images::download_image,
            audio::save_audio,
            bundle::export_data,
            bundle::import_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
