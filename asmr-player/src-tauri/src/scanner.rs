use sqlx::SqlitePool;
use std::path::Path;
use tauri::{AppHandle, Manager, Emitter};
use walkdir::WalkDir;
use regex::Regex;

#[tauri::command]
pub async fn scan_library(app: AppHandle, root_path: String, pool: tauri::State<'_, SqlitePool>) -> Result<usize, String> {
    let pool = pool.inner();
    let root = Path::new(&root_path);
    if !root.exists() {
        return Err("Directory does not exist".to_string());
    }

    let rj_regex = Regex::new(r"(RJ|BJ)\d{6,8}").unwrap();
    let mut count = 0;

    // This is a simplified recursive scan. 
    // For MVP, we assume works are first-level subdirectories OR directories matching RJ code.
    // Iterating recursively might find nested RJ codes.
    
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
            
            // Check if directory name contains RJ code or if it's a leaf node with audio content
            if let Some(caps) = rj_regex.captures(&dir_name) {
                let rj_code = caps.get(0).map(|m| m.as_str()).unwrap_or("");
                let title = dir_name.to_string(); // Use directory name as title for now
                let path_str = path.to_string_lossy().to_string();

                // Insert into works
                let work_id = sqlx::query!(
                    r#"
                    INSERT INTO works (rj_code, title, dir_path) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(rj_code) DO UPDATE SET dir_path = excluded.dir_path
                    RETURNING id
                    "#,
                    rj_code,
                    title,
                    path_str
                )
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?
                .map(|r| r.id);

                if let Some(wid) = work_id {
                     count += 1;
                     // Scan for tracks in this directory
                     scan_tracks(wid, path, pool).await.ok();
                     app.emit("scan-progress", count).ok();
                }
            }
        }
    }

    Ok(count)
}

async fn scan_tracks(work_id: i64, path: &Path, pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for entry in WalkDir::new(path).max_depth(1).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.is_file() {
            if let Some(ext) = p.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ["mp3", "wav", "flac", "m4a", "ogg"].contains(&ext_str.as_str()) {
                    let title = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
                    let path_str = p.to_string_lossy().to_string();
                    
                    sqlx::query!(
                        "INSERT INTO tracks (work_id, title, path) VALUES (?, ?, ?)",
                        work_id,
                        title,
                        path_str
                    )
                    .execute(pool)
                    .await?;
                }
            }
        }
    }
    Ok(())
}
