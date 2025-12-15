mod audio;
mod scraper;
mod scanner;

use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Mutex;
use tauri::Manager;
use std::str::FromStr;

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
    // Metadata as comma-separated strings
    tags: Option<String>, 
    voice_actors: Option<String>,
    circles: Option<String>,
}

#[tauri::command]
async fn get_all_works(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<Work>, String> {
    let sql = r#"
        SELECT 
            w.id, w.rj_code, w.title, w.dir_path, w.cover_path,
            (SELECT GROUP_CONCAT(name, ', ') FROM tags t JOIN work_tags wt ON t.id = wt.tag_id WHERE wt.work_id = w.id) as tags,
            (SELECT GROUP_CONCAT(name, ', ') FROM voice_actors v JOIN work_voice_actors wv ON v.id = wv.voice_actor_id WHERE wv.work_id = w.id) as voice_actors,
            (SELECT GROUP_CONCAT(name, ', ') FROM circles c JOIN work_circles wc ON c.id = wc.circle_id WHERE wc.work_id = w.id) as circles
        FROM works w
        ORDER BY w.created_at DESC
    "#;

    let works = sqlx::query_as::<_, Work>(sql)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(works)
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Track {
    id: i64,
    work_id: i64,
    title: String,
    path: String,
    #[serde(rename = "duration")]
    duration_sec: i64,
}

#[tauri::command]
async fn get_work_tracks(pool: tauri::State<'_, sqlx::SqlitePool>, work_id: i64) -> Result<Vec<Track>, String> {
    let tracks = sqlx::query_as::<_, Track>("SELECT id, work_id, title, path, duration_sec FROM tracks WHERE work_id = ? ORDER BY title ASC")
        .bind(work_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(tracks)
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Tag {
    id: i64,
    name: String,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct VoiceActor {
    id: i64,
    name: String,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Circle {
    id: i64,
    name: String,
}

#[derive(serde::Serialize)]
pub struct WorkMetadata {
    tags: Vec<Tag>,
    voice_actors: Vec<VoiceActor>,
    circles: Vec<Circle>,
}

#[tauri::command]
async fn get_work_metadata(pool: tauri::State<'_, sqlx::SqlitePool>, work_id: i64) -> Result<WorkMetadata, String> {
    let tags = sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name FROM tags t JOIN work_tags wt ON t.id = wt.tag_id WHERE wt.work_id = ?"
    )
    .bind(work_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let voice_actors = sqlx::query_as::<_, VoiceActor>(
        "SELECT v.id, v.name FROM voice_actors v JOIN work_voice_actors wv ON v.id = wv.voice_actor_id WHERE wv.work_id = ?"
    )
    .bind(work_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let circles = sqlx::query_as::<_, Circle>(
        "SELECT c.id, c.name FROM circles c JOIN work_circles wc ON c.id = wc.circle_id WHERE wc.work_id = ?"
    )
    .bind(work_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(WorkMetadata {
        tags,
        voice_actors,
        circles,
    })
}

#[tauri::command]
async fn scrape_work_metadata(pool: tauri::State<'_, sqlx::SqlitePool>, work_id: i64) -> Result<String, String> {
    // 1. Get RJ code
    let work: Work = sqlx::query_as("SELECT * FROM works WHERE id = ?")
        .bind(work_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Work not found")?;

    let rj_code = work.rj_code.ok_or("No RJ code for this work")?;

    // 2. Fetch from DLsite
    let metadata = scraper::fetch_dlsite_metadata(&rj_code).await?;

    // 3. Update DB
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Insert Circle
    if let Some(circle_name) = metadata.circle {
        // Try to insert circle
        // Using a transaction, so we can try select first to avoid complex INSERT logic if we want ids
        
        let existing_id: Option<i64> = sqlx::query_scalar("SELECT id FROM circles WHERE name = ?")
            .bind(&circle_name)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        let circle_id = if let Some(id) = existing_id {
            id
        } else {
            sqlx::query_scalar("INSERT INTO circles (name) VALUES (?) RETURNING id")
                .bind(&circle_name)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
        };

        sqlx::query("INSERT OR IGNORE INTO work_circles (work_id, circle_id) VALUES (?, ?)")
            .bind(work_id)
            .bind(circle_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Insert Voice Actors
    for va_name in metadata.voice_actors {
         let existing_id: Option<i64> = sqlx::query_scalar("SELECT id FROM voice_actors WHERE name = ?")
            .bind(&va_name)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        let va_id = if let Some(id) = existing_id {
            id
        } else {
            sqlx::query_scalar("INSERT INTO voice_actors (name) VALUES (?) RETURNING id")
                .bind(&va_name)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
        };
        
        sqlx::query("INSERT OR IGNORE INTO work_voice_actors (work_id, voice_actor_id) VALUES (?, ?)")
            .bind(work_id)
            .bind(va_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Insert Tags
    for tag_name in metadata.tags {
         let existing_id: Option<i64> = sqlx::query_scalar("SELECT id FROM tags WHERE name = ?")
            .bind(&tag_name)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        let tag_id = if let Some(id) = existing_id {
            id
        } else {
            sqlx::query_scalar("INSERT INTO tags (name) VALUES (?) RETURNING id")
                .bind(&tag_name)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
        };
        
        sqlx::query("INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)")
            .bind(work_id)
            .bind(tag_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(format!("Updated metadata for {}", metadata.title))
}

#[tauri::command]
async fn update_work_metadata(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    work_id: i64,
    title: String,
    circles: String,
    voice_actors: String,
    tags: String
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Update Title
    sqlx::query("UPDATE works SET title = ? WHERE id = ?")
        .bind(&title)
        .bind(work_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Helper to process comma-separated lists
    // We clear existing relations first to handle removals
    sqlx::query("DELETE FROM work_circles WHERE work_id = ?").bind(work_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM work_voice_actors WHERE work_id = ?").bind(work_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM work_tags WHERE work_id = ?").bind(work_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Circles
    for name in circles.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let existing_id: Option<i64> = sqlx::query_scalar("SELECT id FROM circles WHERE name = ?")
            .bind(name)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        let id = if let Some(i) = existing_id { i } else {
            sqlx::query_scalar("INSERT INTO circles (name) VALUES (?) RETURNING id")
                .bind(name)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
        };
        sqlx::query("INSERT OR IGNORE INTO work_circles (work_id, circle_id) VALUES (?, ?)")
            .bind(work_id).bind(id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Voice Actors
    for name in voice_actors.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let existing_id: Option<i64> = sqlx::query_scalar("SELECT id FROM voice_actors WHERE name = ?")
            .bind(name)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        
        let id = if let Some(i) = existing_id { i } else {
            sqlx::query_scalar("INSERT INTO voice_actors (name) VALUES (?) RETURNING id")
                .bind(name)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
        };
        sqlx::query("INSERT OR IGNORE INTO work_voice_actors (work_id, voice_actor_id) VALUES (?, ?)")
            .bind(work_id).bind(id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Tags
    for name in tags.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let existing_id: Option<i64> = sqlx::query_scalar("SELECT id FROM tags WHERE name = ?")
            .bind(name)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        
        let id = if let Some(i) = existing_id { i } else {
            sqlx::query_scalar("INSERT INTO tags (name) VALUES (?) RETURNING id")
                .bind(name)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
        };
        sqlx::query("INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)")
            .bind(work_id).bind(id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
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

                let options = sqlx::sqlite::SqliteConnectOptions::from_str(&db_url)
                    .expect("Failed to parse db url")
                    .create_if_missing(true);

                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect_with(options)
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
            get_work_tracks,
            get_work_metadata,
            scrape_work_metadata,
            update_work_metadata,
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
