use rodio::{Decoder, OutputStream, Sink, Source};
use spectrum_analyzer::scaling::divide_by_N;
use spectrum_analyzer::{samples_fft_to_spectrum, FrequencyLimit};
use spectrum_analyzer::windows::hann_window;
use std::fs::File;
use std::io::BufReader;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::broadcast;

pub struct AudioState {
    pub sink: Option<Sink>,
    pub stream: Option<OutputStream>,
    pub stream_handle: Option<rodio::OutputStreamHandle>,
    pub app_handle: Option<AppHandle>,
}

impl AudioState {
    pub fn new() -> Self {
        let (stream, stream_handle) = match OutputStream::try_default() {
            Ok((s, h)) => (Some(s), Some(h)),
            Err(_) => (None, None),
        };
        let sink = if let Some(ref h) = stream_handle {
            Sink::try_new(h).ok()
        } else {
            None
        };

        Self {
            stream,
            stream_handle,
            sink,
            app_handle: None,
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
            buffer: Vec::with_capacity(2048), // Adjust for FFT size
            buffer_size: 2048,
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
            // Send a copy for FFT
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
    fn current_span_len(&self) -> Option<usize> {
        self.input.current_span_len()
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

#[tauri::command]
pub async fn play_track(
    app: AppHandle,
    state: State<'_, Mutex<AudioState>>,
    path: String,
) -> Result<(), String> {
    let mut audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    audio.app_handle = Some(app.clone());

    // Stop existing sink
    if let Some(ref sink) = audio.sink {
        if !sink.empty() {
            // To stop effectively, we replace the sink or pause.
            // Rodio sink doesn't clear easily without recreating.
        }
    }

    // Re-initialize sink to clear queue
    if let Some(ref handle) = audio.stream_handle {
        let new_sink = Sink::try_new(handle).map_err(|e| e.to_string())?;
        audio.sink = Some(new_sink);
    }

    if let Some(ref sink) = audio.sink {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);
        let source = Decoder::new(reader).map_err(|e| e.to_string())?;

        // Convert samples to f32 for spectrum analyzer
        let source_f32 = source.convert_samples::<f32>();

        // Setup channel for Visualizer
        let (tx, mut rx) = broadcast::channel(16);

        let viz_source = VisualizerSource::new(source_f32, tx);

        sink.append(viz_source);
        sink.play();

        // Spawn FFT worker
        let app_handle_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Ok(samples) = rx.recv().await {
                // Run FFT
                // Samples should be power of 2, e.g. 2048
                // Spectrum analyzer expects Map<Frequency, Value>
                let spectrum = samples_fft_to_spectrum(
                    &samples,
                    44100, // Assuming 44.1kHz, ideally get from source info but simplified here
                    FrequencyLimit::Range(20., 20000.),
                    Some(&hann_window), // Apply Hann window
                    Some(&divide_by_N),
                );

                if let Ok(spec) = spectrum {
                    // Convert to simple array for frontend
                    // We just want magnitudes.
                    // The spectrum is a map of frequency -> Complex/Value.
                    // Let's simplified: take values, sort by freq, downsample to ~100 bars?
                    // Or just send raw average magnitudes.

                    let mut data: Vec<f32> = spec.data().iter().map(|(_, val)| val.val()).collect();
                    // Cap data size to avoid sending too much?
                    if data.len() > 100 {
                        data.truncate(100);
                    }

                    let _ = app_handle_clone.emit("spectrum-update", data);
                }
            }
        });
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
pub fn seek_track(state: State<'_, Mutex<AudioState>>, seconds: f32) -> Result<(), String> {
    let audio = state.lock().map_err(|_| "Failed to lock audio state")?;
    if let Some(ref sink) = audio.sink {
        sink.try_seek(Duration::from_secs_f32(seconds))
            .map_err(|e| e.to_string())?;
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
