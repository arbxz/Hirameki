use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

mod audio;
mod bundle;
mod images;
mod storage;

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
    ];

    tauri::Builder::default()
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
        )
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
