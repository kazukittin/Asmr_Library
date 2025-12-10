mod audio;
mod scanner;

use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Mutex;
use tauri::{Listener, Manager};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Work {
    id: i64,
    rj_code: Option<String>,
    title: String,
    dir_path: String,
    cover_path: Option<String>,
}

#[tauri::command]
async fn get_all_works(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<Work>, String> {
    let works = sqlx::query_as::<_, Work>("SELECT id, rj_code, title, dir_path, cover_path FROM works ORDER BY created_at DESC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(works)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // Setup Audio State
            app.manage(Mutex::new(audio::AudioState::new()));

            // Setup Database connection for Backend usage (Scanner)
            // We use tokio::spawn to initialize it async because setup is synchronous (mostly)?
            // Actually setup closure returns Result. We can block_on or use tauri::async_runtime.

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Initialize DB
                // The DB file is likely managed by tauri-plugin-sql at AppData/filename.db
                // We need to know where it is.
                // Alternatively, we can just open a file in the app data dir.

                let app_dir = app_handle.path().app_data_dir().unwrap();
                std::fs::create_dir_all(&app_dir).unwrap();
                let db_path = app_dir.join("library.db");
                let db_url = format!("sqlite://{}", db_path.to_string_lossy());

                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await
                    .expect("Failed to connect to DB");

                sqlx::migrate!("./migrations")
                    .run(&pool)
                    .await
                    .expect("Failed to run migrations");

                app_handle.manage(pool);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_all_works,
            scanner::scan_library,
            audio::play_track,
            audio::pause_track,
            audio::resume_track,
            audio::seek_track,
            audio::set_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
