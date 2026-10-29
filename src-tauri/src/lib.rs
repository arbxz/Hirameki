use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

mod bundle;
mod images;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // reqwest is built without a bundled TLS crypto provider; install ring once.
    let _ = rustls::crypto::ring::default_provider().install_default();

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
        Migration {
            version: 7,
            description: "workspaces",
            sql: include_str!("../migrations/007_workspaces.sql"),
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
        .invoke_handler(tauri::generate_handler![
            images::save_image,
            images::download_image,
            bundle::export_data,
            bundle::import_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
