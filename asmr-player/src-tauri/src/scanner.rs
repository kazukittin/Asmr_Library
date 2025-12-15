use regex::Regex;
use sqlx::SqlitePool;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;
use lofty::{read_from_path, prelude::*};

#[tauri::command]
pub async fn scan_library(
    app: AppHandle,
    root_path: String,
    pool: tauri::State<'_, SqlitePool>,
) -> Result<usize, String> {
    let pool = pool.inner();
    let root = Path::new(&root_path);
    if !root.exists() {
        return Err("Directory does not exist".to_string());
    }

    let rj_regex = Regex::new(r"(RJ|BJ)\d{6,8}").unwrap();
    let mut count = 0;

    // Use WalkDir with max_depth(1) to iterate over immediate subdirectories of the root
    // If the user selects a folder "MyLibrary" containing "RJ123456", "RJ654321", "ASMR_Folder"
    // We want to detect those.
    // If the user selects the root of a drive, this might be slow if we go too deep, but max_depth(1) is safe.
    // NOTE: The previous logic used recursive walk but filtered.
    // Let's stick to the prompt's implication: "Detect folders containing RJ... If no RJ, check if folder contains audio directly (Fallback)."
    // Ideally we walk the tree. But simplistic walk is safer for MVP.
    // Let's assume the user gives a folder that contains Works.

    // We will do a full recursive walk but look for "Work" directories.
    // A directory is a "Work" if:
    // 1. Its name matches RJ code.
    // 2. It doesn't match RJ code, but it contains Audio files directly AND is not a parent of other Works (simplified: just check audio).
    // To avoid over-scanning, we can use `into_iter().filter_entry(...)` if we want to skip already found works.
    // But for MVP, let's stick to:
    // Iterate all directories. If it looks like a work, process it and maybe don't recurse into it?
    // WalkDir doesn't support "skip children" easily in the iterator loop unless we control the iterator manually.

    // Revised Strategy for MVP:
    // 1. Walk entire tree.
    // 2. For each directory:
    //    a. Check if it matches RJ code. -> It's a Work.
    //    b. If NOT RJ code: check if it contains audio files. -> It's a Fallback Work.
    // 3. Problem: A generic folder might contain subfolders. If we register the parent as a work, should we scan subfolders?
    //    Usually "Fallback" works are leaf nodes or close to leaves.
    //    Let's register ANY directory with audio files as a work if it hasn't been covered by a parent work? No, that's complex.
    //    Simple approach: Just register every folder that has audio files or RJ code.

    let mut it = WalkDir::new(root).into_iter();
    
    loop {
        let entry = match it.next() {
            None => break,
            Some(Err(_)) => continue,
            Some(Ok(e)) => e,
        };

        let path = entry.path();
        
        // Skip root directory itself
        if path == root {
            continue;
        }

        if path.is_dir() {
            let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
            let mut is_work = false;
            let mut rj_code: Option<String> = None;
            let title = dir_name.to_string();

            // 1. Check RJ Code
            if let Some(caps) = rj_regex.captures(&dir_name) {
                rj_code = caps.get(0).map(|m| m.as_str().to_string());
                is_work = true;
            }
            // 2. Fallback: Check for audio files logic
            else if contains_audio_files(path) {
                is_work = true;
            }

            if is_work {
                let path_str = path.to_string_lossy().to_string();
                let mut cover_path = find_cover_image(path);
                
                // Fallback: Try to extract from audio file metadata
                if cover_path.is_none() {
                    cover_path = extract_embedded_cover(path);
                }

                let existing_id: Option<i64> = sqlx::query("SELECT id FROM works WHERE dir_path = ?")
                    .bind(&path_str)
                    .fetch_optional(pool)
                    .await
                    .ok()
                    .flatten()
                    .map(|row| {
                        use sqlx::Row;
                        row.get(0)
                    });

                let work_id: Option<i64> = if let Some(eid) = existing_id {
                    Some(eid)
                } else {
                    sqlx::query(
                        r#"
                        INSERT INTO works (rj_code, title, dir_path, cover_path) 
                        VALUES (?, ?, ?, ?)
                        RETURNING id
                        "#
                    )
                    .bind(rj_code)
                    .bind(title)
                    .bind(path_str)
                    .bind(cover_path)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| e.to_string())?
                    .map(|row| {
                        use sqlx::Row;
                        row.get(0)
                    })
                };

                if let Some(wid) = work_id {
                    count += 1;
                    // Scan for tracks in this directory
                    let _ = sqlx::query("DELETE FROM tracks WHERE work_id = ?")
                        .bind(wid)
                        .execute(pool)
                        .await;

                    scan_tracks(wid, path, pool).await.ok();
                    app.emit("scan-progress", count).ok();
                }
                
                // IMPORTANT: Do not scan subdirectories of a Work
                it.skip_current_dir();
            }
        }
    }

    Ok(count)
}

fn contains_audio_files(path: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ["mp3", "wav", "flac", "m4a", "mp4", "ogg"].contains(&ext_str.as_str()) {
                    return true;
                }
            }
        }
    }
    false
}

fn find_cover_image(path: &Path) -> Option<String> {
    let mut best_candidate: Option<(u64, PathBuf)> = None; // (size, path)

    let priority_names = ["cover", "folder", "front", "main", "jacket"];

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(stem) = p.file_stem() {
                    let stem_str = stem.to_string_lossy().to_lowercase();
                    let ext = p
                        .extension()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase();

                    if ["jpg", "jpeg", "png", "webp", "bmp"].contains(&ext.as_str()) {
                        // Check priority
                        if priority_names.contains(&stem_str.as_str()) {
                            return Some(p.to_string_lossy().to_string());
                        }

                        // Keep track of largest image as fallback
                        if let Ok(meta) = p.metadata() {
                            let size = meta.len();
                            if best_candidate.as_ref().map_or(true, |(s, _)| size > *s) {
                                best_candidate = Some((size, p));
                            }
                        }
                    }
                }
            }
        }
    }

    best_candidate.map(|(_, p)| p.to_string_lossy().to_string())
}

fn extract_embedded_cover(dir_path: &Path) -> Option<String> {
    // 1. Check if we already have an extracted cover
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                if name.starts_with("cover_extracted") {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        }
    }

    // 2. Scan audio files for embedded pictures
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    // Prioritize formats likely to have tags
                    if ["mp3", "flac", "m4a", "ogg", "opus"].contains(&ext_str.as_str()) {
                         if let Ok(tagged_file) = read_from_path(&p) {
                             // Check all tags for pictures
                             for tag in tagged_file.tags() {
                                 if let Some(pic) = tag.pictures().first() {
                                     let save_ext = if let Some(mime) = pic.mime_type() {
                                         // MimeType is an enum, convert to string
                                         let s = format!("{:?}", mime).to_lowercase();
                                         if s.contains("png") { "png" } else { "jpg" }
                                     } else {
                                         "jpg"
                                     };
                                     
                                     let cover_filename = format!("cover_extracted.{}", save_ext);
                                     let save_path = dir_path.join(&cover_filename);
                                     
                                     if fs::write(&save_path, pic.data()).is_ok() {
                                         println!("Extracted cover to: {:?}", save_path);
                                         return Some(save_path.to_string_lossy().to_string());
                                     }
                                 }
                             }
                         }
                    }
                }
            }
        }
    }
    None
}

async fn scan_tracks(work_id: i64, path: &Path, pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for entry in WalkDir::new(path)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = entry.path();
        if p.is_file() {
            if let Some(ext) = p.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if ["mp3", "wav", "flac", "m4a", "mp4", "ogg"].contains(&ext_str.as_str()) {
                    let title = p
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let path_str = p.to_string_lossy().to_string();

                    // Extract Duration using Lofty
                    let duration_sec = match read_from_path(p) {
                        Ok(tagged_file) => tagged_file.properties().duration().as_secs() as i64,
                        Err(e) => {
                            eprintln!("Lofty Error on {}: {}", title, e);
                            0
                        }
                    };

                    // Log duration for debugging
                    if duration_sec > 0 {
                        println!("Scanned {}: {}s", title, duration_sec);
                    } else {
                        println!("Warning: Could not determine duration for {}", title);
                    }

                    sqlx::query(
                        "INSERT INTO tracks (work_id, title, path, duration_sec) VALUES (?, ?, ?, ?)"
                    )
                    .bind(work_id)
                    .bind(title)
                    .bind(path_str)
                    .bind(duration_sec)
                    .execute(pool)
                    .await?;
                }
            }
        }
    }
    Ok(())
}
