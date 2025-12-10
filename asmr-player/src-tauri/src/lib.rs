mod scanner;
mod audio;

use tauri::{Manager, Listener};
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Mutex;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            scanner::scan_library,
            audio::play_track,
            audio::pause_track,
            audio::resume_track
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
