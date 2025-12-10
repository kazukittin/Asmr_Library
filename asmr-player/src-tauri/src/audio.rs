use rodio::{Decoder, OutputStream, Sink, Source, OutputStreamHandle};
use spectrum_analyzer::scaling::divide_by_N;
use spectrum_analyzer::{samples_fft_to_spectrum, FrequencyLimit};
use std::fs::File;
use std::io::BufReader;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::broadcast;

pub struct AudioState {
    pub sink: Option<Sink>,
    // stream is !Send, so we don't store it here. We leak it in new().
    pub stream_handle: Option<OutputStreamHandle>, 
    pub app_handle: Option<AppHandle>,
    pub current_path: Option<String>,
}

// Sink and OutputStreamHandle are Send. The OutputStream itself is not.
// By leaking the OutputStream and only storing its handle, AudioState becomes Send.
unsafe impl Send for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        // match on try_default.
        // We MUST keep the stream alive, but we can't store it in tauri::State (requires Send).
        // Since we want it to live for the app duration, we leak it.
        let (stream, stream_handle) = match OutputStream::try_default() {
            Ok((s, h)) => (Some(s), Some(h)),
            Err(_) => (None, None),
        };
        
        if let Some(s) = stream {
            // Leak the stream to keep it alive without dropping it.
            Box::leak(Box::new(s));
        }

        let sink = if let Some(ref h) = stream_handle {
             Sink::try_new(h).ok()
        } else {
            None
        };

        Self {
            stream_handle,
            sink,
            app_handle: None,
            current_path: None,
        }
    }
}

// Custom Source to sniff samples for FFT
struct VisualizerSource<I>
where
    I: Source<Item = f32> + Send,
{
    input: I,
    sender: broadcast::Sender<Vec<f32>>,
    buffer: Vec<f32>,
    buffer_size: usize,
}

impl<I> VisualizerSource<I>
where
    I: Source<Item = f32> + Send,
{
    pub fn new(input: I, sender: broadcast::Sender<Vec<f32>>) -> Self {
        Self {
            input,
            sender,
            buffer: Vec::with_capacity(1024),
            buffer_size: 1024,
        }
    }
}

impl<I> Iterator for VisualizerSource<I>
where
    I: Source<Item = f32> + Send,
{
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.input.next()?;
        
        self.buffer.push(sample);
        if self.buffer.len() >= self.buffer_size {
            let _ = self.sender.send(self.buffer.clone());
            self.buffer.clear();
        }
        
        Some(sample)
    }
}

impl<I> Source for VisualizerSource<I>
where
    I: Source<Item = f32> + Send,
{
    fn current_frame_len(&self) -> Option<usize> {
        self.input.current_frame_len()
    }

    fn channels(&self) -> u16 {
        self.input.channels()
    }

    fn sample_rate(&self) -> u32 {
        self.input.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.input.total_duration()
    }
}

fn setup_sink_and_play(
    sink: &Sink,
    app_handle: AppHandle,
    path: &str,
    skip_seconds: f32,
) -> Result<(), String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let source = Decoder::new(reader).map_err(|e| e.to_string())?;
    
    // rodio 0.17 convert_samples
    let source_f32 = source.convert_samples::<f32>();
    
    // Get metadata BEFORE consuming explicit source
    let sample_rate = source_f32.sample_rate();
    let channels = source_f32.channels();
    let total_duration = source_f32.total_duration();

    // Emit duration
    if let Some(duration) = total_duration {
        let _ = app_handle.emit("track-duration", duration.as_secs_f64());
    }

    // Skip if seeking
    let source_skipped = source_f32.skip_duration(Duration::from_secs_f32(skip_seconds));

    // Set up channels for visualizer and progress
    // We increase buffer size to avoid lag? No, 16 is fine if we consume fast.
    let (tx, mut rx) = broadcast::channel(32);
    
    let viz_source = VisualizerSource::new(source_skipped, tx);
    
    sink.append(viz_source);
    sink.play();

    tauri::async_runtime::spawn(async move {
        // Calculate initial offset in samples
        let mut processed_samples: u64 = 0;
        let start_offset_seconds = skip_seconds as f64;
        
        let mut last_emit = Instant::now();

        while let Ok(samples) = rx.recv().await {
             let chunk_len = samples.len() as u64;
             processed_samples += chunk_len;

             // 1. FFT
             let spectrum = samples_fft_to_spectrum(
                 &samples,
                 sample_rate, 
                 FrequencyLimit::Range(20., 20000.),
                 Some(&divide_by_N),
             );

             if let Ok(spec) = spectrum {
                 let mut data: Vec<f32> = spec.data().iter().map(|(_, val)| val.val()).collect();
                 if data.len() > 100 {
                     data.truncate(100); 
                 }
                 let _ = app_handle.emit("spectrum-update", data);
             }

             // 2. Progress
             // Only emit every ~250ms or so to save bandwidth
             if last_emit.elapsed().as_millis() > 250 {
                 let samples_per_sec = (sample_rate as u64) * (channels as u64);
                 if samples_per_sec > 0 {
                     let elapsed_seconds = processed_samples as f64 / samples_per_sec as f64;
                     let total_current_time = start_offset_seconds + elapsed_seconds;
                     let _ = app_handle.emit("playback-progress", total_current_time);
                 }
                 last_emit = Instant::now();
             }
        }
    });
    
    Ok(())
}


#[tauri::command]
pub async fn play_track(
    app: AppHandle,
    state: State<'_, Mutex<AudioState>>,
    path: String,
) -> Result<(), String> {
    let mut audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    audio.app_handle = Some(app.clone());
    audio.current_path = Some(path.clone());
    
    // Reset sink
    if let Some(ref handle) = audio.stream_handle {
         let new_sink = Sink::try_new(handle).map_err(|e| e.to_string())?;
         audio.sink = Some(new_sink);
    }

    if let Some(ref sink) = audio.sink {
        setup_sink_and_play(sink, app.clone(), &path, 0.0)?;
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

#[tauri::command]
pub fn seek_track(app: AppHandle, state: State<'_, Mutex<AudioState>>, seconds: f32) -> Result<(), String> {
    let mut audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    
    let path = if let Some(ref p) = audio.current_path {
        p.clone()
    } else {
        return Ok(()); // Nothing playing
    };

    // Recreate sink to clear current buffer and seek
    if let Some(ref handle) = audio.stream_handle {
         let new_sink = Sink::try_new(handle).map_err(|e| e.to_string())?;
         audio.sink = Some(new_sink);
    }
    
    if let Some(ref sink) = audio.sink {
        setup_sink_and_play(sink, app.clone(), &path, seconds)?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn set_volume(state: State<'_, Mutex<AudioState>>, volume: f32) -> Result<(), String> {
    let audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    if let Some(ref sink) = audio.sink {
        sink.set_volume(volume);
    }
    Ok(())
}
