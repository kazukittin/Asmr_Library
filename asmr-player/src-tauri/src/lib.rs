mod audio;
mod scraper;
mod scanner;

use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Mutex;
use tauri::{Manager, AppHandle, Emitter};
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

    let all_works = sqlx::query_as::<_, Work>(sql)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    // Filter out works whose directories no longer exist
    let works: Vec<Work> = all_works
        .into_iter()
        .filter(|w| std::path::Path::new(&w.dir_path).exists())
        .collect();
    
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

#[derive(serde::Serialize)]
pub struct SuggestionItem {
    name: String,
    count: i64,
}

#[tauri::command]
async fn get_all_circles(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<SuggestionItem>, String> {
    let circles = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT c.name, COUNT(wc.work_id) as count 
        FROM circles c 
        LEFT JOIN work_circles wc ON c.id = wc.circle_id 
        GROUP BY c.id 
        ORDER BY count DESC, c.name ASC
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(circles.into_iter().map(|(name, count)| SuggestionItem { name, count }).collect())
}

#[tauri::command]
async fn get_all_voice_actors(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<SuggestionItem>, String> {
    let voice_actors = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT v.name, COUNT(wv.work_id) as count 
        FROM voice_actors v 
        LEFT JOIN work_voice_actors wv ON v.id = wv.voice_actor_id 
        GROUP BY v.id 
        ORDER BY count DESC, v.name ASC
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(voice_actors.into_iter().map(|(name, count)| SuggestionItem { name, count }).collect())
}

#[tauri::command]
async fn get_all_tags(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<SuggestionItem>, String> {
    let tags = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT t.name, COUNT(wt.work_id) as count 
        FROM tags t 
        LEFT JOIN work_tags wt ON t.id = wt.tag_id 
        GROUP BY t.id 
        ORDER BY count DESC, t.name ASC
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(tags.into_iter().map(|(name, count)| SuggestionItem { name, count }).collect())
}

#[tauri::command]
async fn get_works_by_voice_actor(pool: tauri::State<'_, sqlx::SqlitePool>, voice_actor_id: i64) -> Result<Vec<Work>, String> {
    let sql = r#"
        SELECT 
            w.id, w.rj_code, w.title, w.dir_path, w.cover_path,
            (SELECT GROUP_CONCAT(name, ', ') FROM tags t JOIN work_tags wt ON t.id = wt.tag_id WHERE wt.work_id = w.id) as tags,
            (SELECT GROUP_CONCAT(name, ', ') FROM voice_actors v JOIN work_voice_actors wv ON v.id = wv.voice_actor_id WHERE wv.work_id = w.id) as voice_actors,
            (SELECT GROUP_CONCAT(name, ', ') FROM circles c JOIN work_circles wc ON c.id = wc.circle_id WHERE wc.work_id = w.id) as circles
        FROM works w
        JOIN work_voice_actors wva ON w.id = wva.work_id
        WHERE wva.voice_actor_id = ?
        ORDER BY w.created_at DESC
    "#;

    let works = sqlx::query_as::<_, Work>(sql)
        .bind(voice_actor_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(works)
}

#[tauri::command]
async fn get_works_by_tag(pool: tauri::State<'_, sqlx::SqlitePool>, tag_id: i64) -> Result<Vec<Work>, String> {
    let sql = r#"
        SELECT 
            w.id, w.rj_code, w.title, w.dir_path, w.cover_path,
            (SELECT GROUP_CONCAT(name, ', ') FROM tags t JOIN work_tags wt ON t.id = wt.tag_id WHERE wt.work_id = w.id) as tags,
            (SELECT GROUP_CONCAT(name, ', ') FROM voice_actors v JOIN work_voice_actors wv ON v.id = wv.voice_actor_id WHERE wv.work_id = w.id) as voice_actors,
            (SELECT GROUP_CONCAT(name, ', ') FROM circles c JOIN work_circles wc ON c.id = wc.circle_id WHERE wc.work_id = w.id) as circles
        FROM works w
        JOIN work_tags wt ON w.id = wt.work_id
        WHERE wt.tag_id = ?
        ORDER BY w.created_at DESC
    "#;

    let works = sqlx::query_as::<_, Work>(sql)
        .bind(tag_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(works)
}

#[tauri::command]
async fn get_works_by_tags(pool: tauri::State<'_, sqlx::SqlitePool>, tag_ids: Vec<i64>) -> Result<Vec<Work>, String> {
    if tag_ids.is_empty() {
        return Ok(vec![]);
    }

    // Build placeholders for IN clause
    let placeholders: Vec<String> = tag_ids.iter().map(|_| "?".to_string()).collect();
    let in_clause = placeholders.join(", ");
    let tag_count = tag_ids.len() as i64;

    // SQL: Find works that have ALL the specified tags (AND condition)
    let sql = format!(r#"
        SELECT 
            w.id, w.rj_code, w.title, w.dir_path, w.cover_path,
            (SELECT GROUP_CONCAT(name, ', ') FROM tags t JOIN work_tags wt ON t.id = wt.tag_id WHERE wt.work_id = w.id) as tags,
            (SELECT GROUP_CONCAT(name, ', ') FROM voice_actors v JOIN work_voice_actors wv ON v.id = wv.voice_actor_id WHERE wv.work_id = w.id) as voice_actors,
            (SELECT GROUP_CONCAT(name, ', ') FROM circles c JOIN work_circles wc ON c.id = wc.circle_id WHERE wc.work_id = w.id) as circles
        FROM works w
        WHERE w.id IN (
            SELECT work_id FROM work_tags 
            WHERE tag_id IN ({})
            GROUP BY work_id
            HAVING COUNT(DISTINCT tag_id) = ?
        )
        ORDER BY w.created_at DESC
    "#, in_clause);

    let mut query = sqlx::query_as::<_, Work>(&sql);
    for tag_id in &tag_ids {
        query = query.bind(tag_id);
    }
    query = query.bind(tag_count);

    let works = query
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(works)
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct VoiceActorWithCount {
    id: i64,
    name: String,
    count: i64,
}

#[tauri::command]
async fn get_voice_actors_with_count(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<VoiceActorWithCount>, String> {
    let result = sqlx::query_as::<_, VoiceActorWithCount>(
        r#"
        SELECT v.id, v.name, COUNT(wv.work_id) as count 
        FROM voice_actors v 
        LEFT JOIN work_voice_actors wv ON v.id = wv.voice_actor_id 
        GROUP BY v.id 
        HAVING count > 0
        ORDER BY count DESC, v.name ASC
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(result)
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct TagWithCount {
    id: i64,
    name: String,
    count: i64,
}

#[tauri::command]
async fn get_tags_with_count(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<TagWithCount>, String> {
    let result = sqlx::query_as::<_, TagWithCount>(
        r#"
        SELECT t.id, t.name, COUNT(wt.work_id) as count 
        FROM tags t 
        LEFT JOIN work_tags wt ON t.id = wt.tag_id 
        GROUP BY t.id 
        HAVING count > 0
        ORDER BY count DESC, t.name ASC
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(result)
}

// ============ Playlist APIs ============

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Playlist {
    id: i64,
    name: String,
    track_count: i64,
}

#[tauri::command]
async fn get_all_playlists(pool: tauri::State<'_, sqlx::SqlitePool>) -> Result<Vec<Playlist>, String> {
    let playlists = sqlx::query_as::<_, Playlist>(
        r#"
        SELECT p.id, p.name, COUNT(pt.track_id) as track_count 
        FROM playlists p 
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id 
        GROUP BY p.id 
        ORDER BY p.created_at DESC
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(playlists)
}

#[tauri::command]
async fn create_playlist(pool: tauri::State<'_, sqlx::SqlitePool>, name: String) -> Result<i64, String> {
    let id: i64 = sqlx::query_scalar("INSERT INTO playlists (name) VALUES (?) RETURNING id")
        .bind(&name)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(id)
}

#[tauri::command]
async fn delete_playlist(pool: tauri::State<'_, sqlx::SqlitePool>, playlist_id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM playlists WHERE id = ?")
        .bind(playlist_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn add_track_to_playlist(pool: tauri::State<'_, sqlx::SqlitePool>, playlist_id: i64, track_id: i64) -> Result<(), String> {
    // Get max position
    let max_pos: Option<i64> = sqlx::query_scalar("SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = ?")
        .bind(playlist_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    let new_pos = max_pos.unwrap_or(0) + 1;
    
    sqlx::query("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)")
        .bind(playlist_id)
        .bind(track_id)
        .bind(new_pos)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn remove_track_from_playlist(pool: tauri::State<'_, sqlx::SqlitePool>, playlist_id: i64, track_id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?")
        .bind(playlist_id)
        .bind(track_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PlaylistTrack {
    id: i64,
    title: String,
    path: String,
    duration_sec: Option<i64>,
    work_id: i64,
    work_title: String,
    cover_path: Option<String>,
}

#[tauri::command]
async fn get_playlist_tracks(pool: tauri::State<'_, sqlx::SqlitePool>, playlist_id: i64) -> Result<Vec<PlaylistTrack>, String> {
    let sql = r#"
        SELECT 
            t.id, t.title, t.path, t.duration_sec, t.work_id,
            w.title as work_title, w.cover_path
        FROM tracks t
        JOIN playlist_tracks pt ON t.id = pt.track_id
        JOIN works w ON t.work_id = w.id
        WHERE pt.playlist_id = ?
        ORDER BY pt.position ASC
    "#;

    let tracks = sqlx::query_as::<_, PlaylistTrack>(sql)
        .bind(playlist_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(tracks)
}

// ============ Playback Progress APIs ============

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PlaybackProgress {
    work_id: i64,
    track_id: i64,
    position_sec: f64,
}

#[tauri::command]
async fn save_playback_progress(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    work_id: i64,
    track_id: i64,
    position_sec: f64
) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO track_progress (work_id, track_id, position_sec, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(work_id) DO UPDATE SET
            track_id = excluded.track_id,
            position_sec = excluded.position_sec,
            updated_at = CURRENT_TIMESTAMP
        "#
    )
    .bind(work_id)
    .bind(track_id)
    .bind(position_sec)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn get_playback_progress(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    work_id: i64
) -> Result<Option<PlaybackProgress>, String> {
    let progress = sqlx::query_as::<_, PlaybackProgress>(
        "SELECT work_id, track_id, position_sec FROM track_progress WHERE work_id = ?"
    )
    .bind(work_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(progress)
}

// ============ Favorites API ============

#[tauri::command]
async fn toggle_favorite(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    work_id: i64
) -> Result<bool, String> {
    // Check if already a favorite (using app_settings with key format "favorite:{work_id}")
    let key = format!("favorite:{}", work_id);
    let existing: Option<String> = sqlx::query_scalar("SELECT value FROM app_settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    if existing.is_some() {
        // Remove favorite
        sqlx::query("DELETE FROM app_settings WHERE key = ?")
            .bind(&key)
            .execute(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        // Add favorite
        sqlx::query("INSERT INTO app_settings (key, value) VALUES (?, 'true')")
            .bind(&key)
            .execute(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
async fn get_favorites(
    pool: tauri::State<'_, sqlx::SqlitePool>
) -> Result<Vec<i64>, String> {
    let keys: Vec<String> = sqlx::query_scalar("SELECT key FROM app_settings WHERE key LIKE 'favorite:%'")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    let ids: Vec<i64> = keys.iter()
        .filter_map(|k| k.strip_prefix("favorite:"))
        .filter_map(|id| id.parse().ok())
        .collect();
    
    Ok(ids)
}

#[tauri::command]
async fn is_favorite(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    work_id: i64
) -> Result<bool, String> {
    let key = format!("favorite:{}", work_id);
    let existing: Option<String> = sqlx::query_scalar("SELECT value FROM app_settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(existing.is_some())
}

// ============ Play History APIs ============

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PlayHistoryItem {
    id: i64,
    work_id: i64,
    work_title: String,
    track_id: i64,
    track_title: String,
    cover_path: Option<String>,
    played_at: String,
}

#[tauri::command]
async fn add_to_history(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    work_id: i64,
    track_id: i64
) -> Result<(), String> {
    sqlx::query("INSERT INTO play_history (work_id, track_id) VALUES (?, ?)")
        .bind(work_id)
        .bind(track_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    // Keep only last 100 history items
    sqlx::query("DELETE FROM play_history WHERE id NOT IN (SELECT id FROM play_history ORDER BY played_at DESC LIMIT 100)")
        .execute(pool.inner())
        .await
        .ok();
    
    Ok(())
}

#[tauri::command]
async fn get_play_history(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    limit: i64
) -> Result<Vec<PlayHistoryItem>, String> {
    let history = sqlx::query_as::<_, PlayHistoryItem>(
        r#"
        SELECT 
            ph.id, ph.work_id, w.title as work_title, 
            ph.track_id, t.title as track_title, w.cover_path,
            datetime(ph.played_at) as played_at
        FROM play_history ph
        JOIN works w ON ph.work_id = w.id
        JOIN tracks t ON ph.track_id = t.id
        ORDER BY ph.played_at DESC
        LIMIT ?
        "#
    )
    .bind(limit)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(history)
}

// ============ Batch Metadata API ============

#[tauri::command]
async fn batch_scrape_metadata(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    app: AppHandle
) -> Result<u32, String> {
    use regex::Regex;
    
    let rj_regex = Regex::new(r"(?i)(RJ|BJ)\d{6,8}").unwrap();
    
    // Get all works that don't have metadata (no circles associated)
    // Include works without RJ code - we'll try to extract from dir_path
    let works: Vec<(i64, Option<String>, String)> = sqlx::query_as(
        r#"
        SELECT w.id, w.rj_code, w.dir_path
        FROM works w
        WHERE NOT EXISTS (SELECT 1 FROM work_circles wc WHERE wc.work_id = w.id)
        "#
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    let total = works.len() as u32;
    let mut success_count = 0u32;
    
    for (i, (work_id, rj_code_opt, dir_path)) in works.iter().enumerate() {
        // Priority 1: Use existing RJ code from DB
        // Priority 2: Extract RJ code from folder path
        let rj_code = match rj_code_opt {
            Some(code) if !code.is_empty() => Some(code.clone()),
            _ => {
                // Try to extract RJ code from dir_path
                rj_regex.captures(dir_path)
                    .and_then(|caps| caps.get(0))
                    .map(|m| m.as_str().to_uppercase())
            }
        };
        
        let rj_code = match rj_code {
            Some(code) => code,
            None => {
                // No RJ code found, skip this work
                continue;
            }
        };
        
        // Emit progress event
        app.emit("batch-scrape-progress", serde_json::json!({
            "current": i + 1,
            "total": total,
            "work_id": work_id,
            "rj_code": &rj_code
        })).ok();
        
        // Use existing scraper module
        match scraper::fetch_dlsite_metadata(&rj_code).await {
            Ok(metadata) => {
                // Update title and rj_code (in case it was extracted from folder)
                sqlx::query("UPDATE works SET title = ?, rj_code = ? WHERE id = ?")
                    .bind(&metadata.title)
                    .bind(&rj_code)
                    .bind(work_id)
                    .execute(pool.inner())
                    .await
                    .ok();
                
                // Insert voice actors
                for cv in &metadata.voice_actors {
                    if let Ok(va_id) = sqlx::query_scalar::<_, i64>(
                        "INSERT INTO voice_actors (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = name RETURNING id"
                    )
                    .bind(cv)
                    .fetch_one(pool.inner())
                    .await {
                        sqlx::query("INSERT OR IGNORE INTO work_voice_actors (work_id, voice_actor_id) VALUES (?, ?)")
                            .bind(work_id)
                            .bind(va_id)
                            .execute(pool.inner())
                            .await
                            .ok();
                    }
                }
                
                // Insert circle
                if let Some(circle) = &metadata.circle {
                    if let Ok(circle_id) = sqlx::query_scalar::<_, i64>(
                        "INSERT INTO circles (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = name RETURNING id"
                    )
                    .bind(circle)
                    .fetch_one(pool.inner())
                    .await {
                        sqlx::query("INSERT OR IGNORE INTO work_circles (work_id, circle_id) VALUES (?, ?)")
                            .bind(work_id)
                            .bind(circle_id)
                            .execute(pool.inner())
                            .await
                            .ok();
                    }
                }
                
                // Insert tags
                for tag in &metadata.tags {
                    if let Ok(tag_id) = sqlx::query_scalar::<_, i64>(
                        "INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = name RETURNING id"
                    )
                    .bind(tag)
                    .fetch_one(pool.inner())
                    .await {
                        sqlx::query("INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)")
                            .bind(work_id)
                            .bind(tag_id)
                            .execute(pool.inner())
                            .await
                            .ok();
                    }
                }
                
                success_count += 1;
            },
            Err(e) => eprintln!("Failed to scrape {}: {}", rj_code, e),
        }
        
        // Small delay to avoid rate limiting
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
    }
    
    Ok(success_count)
}


// ============ Delete Work API ============

#[tauri::command]
async fn delete_work(pool: tauri::State<'_, sqlx::SqlitePool>, work_id: i64, delete_files: bool) -> Result<(), String> {
    // Get work info first
    let work: Option<Work> = sqlx::query_as("SELECT * FROM works WHERE id = ?")
        .bind(work_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    let work = work.ok_or("Work not found")?;
    
    // Delete from database (CASCADE will handle tracks, playlist_works, etc.)
    sqlx::query("DELETE FROM works WHERE id = ?")
        .bind(work_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    // Delete files if requested
    if delete_files {
        let dir_path = std::path::Path::new(&work.dir_path);
        if dir_path.exists() {
            std::fs::remove_dir_all(dir_path)
                .map_err(|e| format!("Failed to delete files: {}", e))?;
        }
    }
    
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
            get_all_circles,
            get_all_voice_actors,
            get_all_tags,
            get_works_by_voice_actor,
            get_works_by_tag,
            get_works_by_tags,
            get_voice_actors_with_count,
            get_tags_with_count,
            get_all_playlists,
            create_playlist,
            delete_playlist,
            add_track_to_playlist,
            remove_track_from_playlist,
            get_playlist_tracks,
            save_playback_progress,
            get_playback_progress,
            toggle_favorite,
            get_favorites,
            is_favorite,
            add_to_history,
            get_play_history,
            batch_scrape_metadata,
            delete_work,
            scanner::scan_library,
            scanner::cleanup_orphaned_works,
            audio::play_track,
            audio::pause_track,
            audio::resume_track,
            audio::seek_track,
            audio::set_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
