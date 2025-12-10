use std::sync::Mutex;
use tauri::State;
use rodio::{OutputStream, Sink, Decoder};
use std::io::BufReader;
use std::fs::File;

pub struct AudioState {
    pub sink: Option<Sink>,
    pub stream: Option<OutputStream>,
    // stream_handle is needed to create new Sinks
    pub stream_handle: Option<rodio::OutputStreamHandle>, 
}

impl AudioState {
    pub fn new() -> Self {
        let (stream, stream_handle) = OutputStream::try_default().ok().map(|(s, h)| (Some(s), Some(h))).unwrap_or((None, None));
        let sink = if let Some(ref h) = stream_handle {
             Sink::try_new(h).ok()
        } else {
            None
        };

        Self {
            stream,
            stream_handle,
            sink,
        }
    }
}

#[tauri::command]
pub async fn play_track(state: State<'_, Mutex<AudioState>>, path: String) -> Result<(), String> {
    let mut audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    
    if let Some(ref sink) = audio.sink {
        if !sink.empty() {
            sink.stop();
        }
        
        // Re-create sink to clear it? Or just append. 
        // rodio::Sink::append adds to queue. For play_track we usually want to replace.
        // There is no clear() on Sink, but creating a new one works.
        // However, we need the stream_handle.
    }
    
    // Re-initialize sink
    if let Some(ref handle) = audio.stream_handle {
         let new_sink = Sink::try_new(handle).map_err(|e| e.to_string())?;
         audio.sink = Some(new_sink);
    }

    if let Some(ref sink) = audio.sink {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let source = Decoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;
        sink.append(source);
        sink.play();
    }
    
    Ok(())
}

#[tauri::command]
pub fn pause_track(state: State<'_, Mutex<AudioState>>) -> Result<(), String> {
    let audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    if let Some(ref sink) = audio.sink {
        sink.pause();
    }
    Ok(())
}

#[tauri::command]
pub fn resume_track(state: State<'_, Mutex<AudioState>>) -> Result<(), String> {
    let audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    if let Some(ref sink) = audio.sink {
        sink.play();
    }
    Ok(())
}
