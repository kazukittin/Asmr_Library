import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, Volume2, Moon } from 'lucide-react';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

// Audio playback modes
type PlaybackMode = 'rust' | 'web' | null;

export function PlayerBar() {
    const {
        isPlaying, currentTrack, setIsPlaying, playNext, playPrev,
        shuffle, repeatMode, toggleShuffle, cycleRepeatMode
    } = usePlayerStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

    const [volume, setVolume] = useState(1.0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(null);

    // Sleep Timer State
    const [sleepTimerSeconds, setSleepTimerSeconds] = useState<number | null>(null);
    const [showSleepMenu, setShowSleepMenu] = useState(false);

    // Initialize Web Audio Context
    const initAudioContext = useCallback(() => {
        if (!audioRef.current) return;

        if (!audioContextRef.current) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContextClass();
        }

        const ctx = audioContextRef.current;

        // Create source node only once
        if (!sourceNodeRef.current) {
            sourceNodeRef.current = ctx.createMediaElementSource(audioRef.current);
            analyserRef.current = ctx.createAnalyser();
            analyserRef.current.fftSize = 256; // 128 bins

            // Connect: Source -> Analyser -> Destination
            sourceNodeRef.current.connect(analyserRef.current);
            analyserRef.current.connect(ctx.destination);
        }

        // Resume context if suspended (policy)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
    }, []);

    // Initialize HTML Audio element
    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
            // Allow crossOrigin for Web Audio if needed (for local files usually not needed but good practice)
            audioRef.current.crossOrigin = "anonymous";

            audioRef.current.addEventListener('timeupdate', () => {
                if (audioRef.current && !isSeeking) {
                    setCurrentTime(audioRef.current.currentTime);
                }
            });
            audioRef.current.addEventListener('loadedmetadata', () => {
                if (audioRef.current) {
                    setDuration(audioRef.current.duration);
                }
            });
            audioRef.current.addEventListener('ended', () => {
                playNext();
            });
            audioRef.current.addEventListener('error', (e) => {
                console.error('[Web Audio] Playback error:', e);
            });

            // Initialize AudioContext when audio element is ready
            // Note: browser policy requires user interaction before resume, but we can setup
            initAudioContext();
        }
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        };
    }, [initAudioContext, playNext]);

    // Sync volume to web audio
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    const stopAllPlayback = useCallback(async () => {
        // Stop Rust backend
        try {
            await invoke('pause_track');
        } catch (e) { /* ignore */ }
        // Stop Web Audio
        if (audioRef.current) {
            audioRef.current.pause();
        }
    }, []);

    const playWithWebAudio = useCallback((path: string) => {
        if (!audioRef.current) {
            console.error('[Web Audio] audioRef is null!');
            return;
        }

        // Ensure context is running
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }

        const src = convertFileSrc(path);
        console.log('[Web Audio] Playing:', path);
        // console.log('[Web Audio] Converted URL:', src); 
        audioRef.current.src = src;
        audioRef.current.volume = volume;
        audioRef.current.play()
            .then(() => {
                console.log('[Web Audio] Playback started successfully');
                setPlaybackMode('web');
                setIsPlaying(true);
            })
            .catch((e) => {
                console.error('[Web Audio] Failed to play:', e);
            });
    }, [volume, setIsPlaying]);

    const togglePlay = async () => {
        if (isPlaying) {
            if (playbackMode === 'rust') {
                await invoke('pause_track');
            } else if (playbackMode === 'web' && audioRef.current) {
                audioRef.current.pause();
            }
            setIsPlaying(false);
        } else {
            if (playbackMode === 'rust') {
                await invoke('resume_track');
            } else if (playbackMode === 'web' && audioRef.current) {
                if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                    audioContextRef.current.resume();
                }
                audioRef.current.play();
            }
            setIsPlaying(true);
        }
    };

    const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        setVolume(v);
        if (playbackMode === 'rust') {
            await invoke('set_volume', { volume: v });
        }
        if (audioRef.current) {
            audioRef.current.volume = v;
        }
    };

    // Visualizer logic (Unified)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let spectrumData: number[] = new Array(100).fill(0);

        // Web Audio Data Buffer
        let webAudioDataArray: Uint8Array;

        const unlisten = listen<number[]>('spectrum-update', (event) => {
            if (playbackMode === 'rust') {
                spectrumData = event.payload;
            }
        });

        const resize = () => {
            if (canvas.parentElement) {
                canvas.width = canvas.parentElement.offsetWidth;
                canvas.height = canvas.parentElement.offsetHeight;
            }
        };
        resize();
        window.addEventListener('resize', resize);

        const draw = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let bars = spectrumData.length;
            let currentData = spectrumData;

            // Fetch Web Audio Data if in web mode
            if (playbackMode === 'web' && analyserRef.current) {
                const analyser = analyserRef.current;
                const bufferLength = analyser.frequencyBinCount;
                if (!webAudioDataArray || webAudioDataArray.length !== bufferLength) {
                    webAudioDataArray = new Uint8Array(bufferLength);
                }
                analyser.getByteFrequencyData(webAudioDataArray as any);

                // Normalize 0-255 to 0.0-1.0 like Rust backend
                // Also take a subset (lower frequencies are usually more interesting)
                // Or just use the whole thing but downsample?
                // Let's just create a float array matching the size we want (e.g. 64 bars)
                const showBars = 64;
                const step = Math.floor(bufferLength / showBars);

                const webSpectrum: number[] = [];
                for (let i = 0; i < showBars; i++) {
                    // Simple downsampling or averaging
                    const val = webAudioDataArray[i * step];
                    webSpectrum.push(val / 255.0);
                }
                currentData = webSpectrum;
                bars = showBars;
            }

            const w = canvas.width / bars;
            const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
            gradient.addColorStop(0, 'rgba(168, 85, 247, 0.0)');
            gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)');
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0.4)');
            ctx.fillStyle = gradient;

            for (let i = 0; i < bars; i++) {
                const val = currentData[i];
                const h = val * 0.8 * canvas.height; // Adjusted gain for visual balance
                ctx.fillRect(i * w, canvas.height - h, w - 1, h);
            }
            animationId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
            unlisten.then(f => f());
        }
    }, [isPlaying, playbackMode]);

    // Timer for Rust backend progress (only when using rust mode)
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isPlaying && !isSeeking && playbackMode === 'rust') {
            interval = setInterval(() => {
                setCurrentTime(prev => {
                    if (duration > 0 && prev >= duration) {
                        playNext();
                        return 0;
                    }
                    if (prev >= duration) return prev;
                    return prev + 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, duration, isSeeking, playNext, playbackMode]);

    // Play track when currentTrack changes - Hybrid approach
    useEffect(() => {
        if (currentTrack && currentTrack.path) {
            // Reset state
            setCurrentTime(0);
            setDuration(currentTrack.duration || 0);
            setPlaybackMode(null);

            // Stop any previous playback
            stopAllPlayback().then(() => {
                // Check file extension - use Web Audio for m4a/mp4 files
                const ext = currentTrack.path.split('.').pop()?.toLowerCase();
                const useWebAudio = ['m4a', 'mp4', 'aac'].includes(ext || '');

                if (useWebAudio) {
                    console.log('[Audio] Using Web Audio for:', ext);
                    playWithWebAudio(currentTrack.path);
                } else {
                    // Try Rust backend for other formats
                    invoke('play_track', { path: currentTrack.path })
                        .then(() => {
                            console.log('[Rust Audio] Playing successfully');
                            setPlaybackMode('rust');
                            setIsPlaying(true);
                            invoke('set_volume', { volume });
                        })
                        .catch((err) => {
                            console.warn('[Rust Audio] Failed, falling back to Web Audio:', err);
                            // Fallback to Web Audio API
                            playWithWebAudio(currentTrack.path);
                        });
                }
            });
        }
    }, [currentTrack]);

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setIsSeeking(true);
        setCurrentTime(val);
    };

    const handleSeekCommit = async () => {
        if (playbackMode === 'rust') {
            await invoke('seek_track', { seconds: currentTime });
        } else if (playbackMode === 'web' && audioRef.current) {
            audioRef.current.currentTime = currentTime;
        }
        setTimeout(() => setIsSeeking(false), 200);
    };

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
    };

    // Sleep Timer Countdown Effect
    useEffect(() => {
        if (sleepTimerSeconds === null || sleepTimerSeconds <= 0) return;

        const interval = setInterval(() => {
            setSleepTimerSeconds(prev => {
                if (prev === null || prev <= 1) {
                    // Timer finished - stop playback
                    stopAllPlayback();
                    setIsPlaying(false);
                    return null;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [sleepTimerSeconds, stopAllPlayback, setIsPlaying]);

    const setSleepTimer = (minutes: number | null) => {
        if (minutes === null) {
            setSleepTimerSeconds(null);
        } else {
            setSleepTimerSeconds(minutes * 60);
        }
        setShowSleepMenu(false);
    };

    const formatSleepTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <footer className="h-20 bg-white border-t border-card-border flex items-center justify-between px-6 z-50 relative shadow-[0_-4px_20px_rgba(0,0,0,0.08)] shrink-0">
            <canvas ref={canvasRef} className="absolute bottom-0 left-0 w-full h-full pointer-events-none opacity-10"></canvas>

            <div className="flex items-center w-1/4 min-w-[240px] z-10">
                {currentTrack && (
                    <>
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden mr-3 group cursor-pointer shadow-md">
                            <img src={currentTrack.cover_path ? convertFileSrc(currentTrack.cover_path) : "https://placehold.co/100x100/e0e0e0/999"} className="w-full h-full object-cover group-hover:opacity-50 transition" />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-bold text-text-primary truncate cursor-pointer hover:underline decoration-accent">{currentTrack.title}</span>
                            <span className="text-xs text-text-muted truncate mt-0.5">{currentTrack.work_title || "作品名未設定"}</span>
                            {playbackMode === 'web' && (
                                <span className="text-[10px] text-accent">🌐 Web Audio</span>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="flex flex-col items-center flex-1 min-w-0 px-4 max-w-3xl w-full z-10">
                <div className="flex items-center gap-6 mb-2">
                    <button
                        className={`transition ${shuffle ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
                        onClick={toggleShuffle}
                        title={shuffle ? 'シャッフル: ON' : 'シャッフル: OFF'}
                    >
                        <Shuffle className="w-4 h-4" />
                    </button>
                    <button className="text-text-secondary hover:text-text-primary hover:scale-110 transition" onClick={playPrev}><SkipBack className="w-5 h-5" /></button>
                    <button
                        className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center hover:scale-105 transition shadow-lg"
                        onClick={togglePlay}
                    >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <button className="text-text-secondary hover:text-text-primary hover:scale-110 transition" onClick={playNext}><SkipForward className="w-5 h-5" /></button>
                    <button
                        className={`transition ${repeatMode !== 'off' ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
                        onClick={cycleRepeatMode}
                        title={`リピート: ${repeatMode === 'off' ? 'OFF' : repeatMode === 'all' ? '全曲' : '1曲'}`}
                    >
                        {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                    </button>
                </div>

                <div className="w-full flex items-center gap-3 text-xs font-mono text-text-muted">
                    <span className="min-w-[40px] text-right text-text-primary">{formatTime(currentTime)}</span>

                    <div className="relative flex-1 h-4 flex items-center group">
                        <input
                            type="range"
                            min="0"
                            max={duration || 1}
                            value={currentTime}
                            onChange={handleSeek}
                            onMouseUp={handleSeekCommit}
                            onTouchEnd={handleSeekCommit}
                            className="absolute w-full h-1 bg-transparent opacity-0 cursor-pointer z-20"
                        />

                        <div className="w-full h-1 bg-gray-200 rounded-lg overflow-hidden relative">
                            <div className="absolute top-0 left-0 h-full bg-accent" style={{ width: `${progressPercent}%` }}></div>
                        </div>

                        <div
                            className="absolute h-3 w-3 bg-accent rounded-full shadow pointer-events-none z-10 transition-transform group-hover:scale-125"
                            style={{ left: `${progressPercent}%`, transform: 'translateX(-50%)' }}
                        ></div>
                    </div>

                    <span className="min-w-[40px]">{formatTime(duration)}</span>
                </div>
            </div>

            <div className="flex items-center justify-end w-1/4 min-w-[200px] gap-4 z-10">
                {/* Sleep Timer */}
                <div className="relative">
                    <button
                        onClick={() => setShowSleepMenu(!showSleepMenu)}
                        className={`p-2 rounded-full transition-colors ${sleepTimerSeconds ? 'bg-accent text-white' : 'text-text-muted hover:text-accent hover:bg-gray-100'}`}
                        title="スリープタイマー"
                    >
                        <Moon className="w-5 h-5" />
                        {sleepTimerSeconds && (
                            <span className="absolute -top-1 -right-1 text-[10px] bg-accent text-white px-1 rounded-full">
                                {formatSleepTime(sleepTimerSeconds)}
                            </span>
                        )}
                    </button>

                    {showSleepMenu && (
                        <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[140px] z-50">
                            <div className="px-3 py-1 text-xs text-gray-400 font-medium">スリープタイマー</div>
                            {[
                                { label: '15分', value: 15 },
                                { label: '30分', value: 30 },
                                { label: '45分', value: 45 },
                                { label: '60分', value: 60 },
                                { label: '90分', value: 90 },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setSleepTimer(opt.value)}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors"
                                >
                                    {opt.label}
                                </button>
                            ))}
                            {sleepTimerSeconds && (
                                <button
                                    onClick={() => setSleepTimer(null)}
                                    className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 transition-colors border-t border-gray-100"
                                >
                                    タイマー解除
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 group">
                    <Volume2 className="w-5 h-5 text-text-muted" />
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="w-20 cursor-pointer accent-accent h-1 bg-gray-200 rounded-lg appearance-none"
                    />
                </div>
            </div>
        </footer>
    );
}

