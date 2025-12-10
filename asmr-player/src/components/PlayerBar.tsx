import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Volume2 } from 'lucide-react';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

export function PlayerBar() {
    const { isPlaying, currentTrack, setIsPlaying, playNext, playPrev } = usePlayerStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [volume, setVolume] = useState(1.0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0); // Mock duration for now, ideally from track metadata

    const togglePlay = async () => {
        if (isPlaying) {
            await invoke('pause_track');
            setIsPlaying(false);
        } else {
            await invoke('resume_track');
            setIsPlaying(true);
        }
    };

    const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = parseFloat(e.target.value);
        setVolume(v);
        await invoke('set_volume', { volume: v });
    };

    const handleSeek = async (e: React.MouseEvent<HTMLDivElement>) => {
        if (!currentTrack) return;
        // Simple mock seek for now, logic needed to get width
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percent = x / width;
        // Mock duration if 0
        const d = duration || currentTrack.duration || 180;
        const seekTime = percent * d;
        setCurrentTime(seekTime);
        await invoke('seek_track', { seconds: seekTime });
    };

    // Visualizer logic (Real)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        // Spectrum data buffer
        let spectrumData: number[] = new Array(100).fill(0);

        const unlisten = listen<number[]>('spectrum-update', (event) => {
            spectrumData = event.payload;
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
            const bars = spectrumData.length;
            const w = canvas.width / bars;
            const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
            gradient.addColorStop(0, 'rgba(168, 85, 247, 0.0)');
            gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)');
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0.4)');
            ctx.fillStyle = gradient;

            for (let i = 0; i < bars; i++) {
                const val = spectrumData[i];
                // Scaling: Logarithmic scale might be better, but linear for MVP is ok.
                // spectrum-analyzer values can be small.
                const h = val * 5.0 * canvas.height; // Arbitrary gain

                // Smooth falloff could be implemented here if data comes too slow
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
    }, [isPlaying]);

    // Timer simulation for progress bar (since we don't strictly get progress back from backend yet efficiently)
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentTime(t => t + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying]);

    // Update duration if track changes
    useEffect(() => {
        if (currentTrack) {
            setDuration(currentTrack.duration || 180);
            setCurrentTime(0);
        }
    }, [currentTrack]);

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <footer className="h-24 bg-[#0f0f12] border-t border-white/5 flex items-center justify-between px-6 z-50 relative shadow-[0_-10px_40px_rgba(0,0,0,0.5)] shrink-0">
            <canvas ref={canvasRef} className="absolute bottom-0 left-0 w-full h-full pointer-events-none opacity-20 mix-blend-screen"></canvas>

            <div className="flex items-center w-1/4 min-w-[240px] z-10">
                {currentTrack && (
                    <>
                        <div className="relative w-14 h-14 rounded-md overflow-hidden mr-4 group cursor-pointer shadow-lg">
                            <img src={currentTrack.cover_path ? convertFileSrc(currentTrack.cover_path) : "https://placehold.co/100x100/2a2a35/FFF"} className="w-full h-full object-cover group-hover:opacity-50 transition" />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-bold text-white truncate cursor-pointer hover:underline decoration-accent">{currentTrack.title}</span>
                            <span className="text-xs text-gray-400 truncate mt-0.5">{currentTrack.work_title || "Unknown Work"}</span>
                        </div>
                    </>
                )}
            </div>

            <div className="flex flex-col items-center flex-1 max-w-2xl px-8 z-10">
                <div className="flex items-center gap-6 mb-2">
                    <button className="text-gray-400 hover:text-white transition"><Shuffle className="w-4 h-4" /></button>
                    <button className="text-gray-300 hover:text-white hover:scale-110 transition" onClick={playPrev}><SkipBack className="w-6 h-6" /></button>
                    <button
                        className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                        onClick={togglePlay}
                    >
                        {isPlaying ? <Pause className="w-5 h-5 ml-0.5" /> : <Play className="w-5 h-5 ml-1" />}
                    </button>
                    <button className="text-gray-300 hover:text-white hover:scale-110 transition" onClick={playNext}><SkipForward className="w-6 h-6" /></button>
                    <button className="text-accent hover:text-accent-glow transition"><Repeat className="w-4 h-4" /></button>
                </div>

                <div className="w-full flex items-center gap-3 text-xs font-mono text-gray-500">
                    <span className="text-white">{formatTime(currentTime)}</span>
                    <div className="relative flex-1 h-1 bg-gray-800 rounded-full group cursor-pointer" onClick={handleSeek}>
                        <div
                            className="absolute top-0 left-0 h-full bg-accent rounded-full group-hover:bg-accent-glow transition-all"
                            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        ></div>
                    </div>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            <div className="flex items-center justify-end w-1/4 min-w-[240px] gap-4 z-10">
                <div className="flex items-center gap-2 group">
                    <Volume2 className="w-5 h-5 text-gray-400" />
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="w-20 cursor-pointer accent-accent h-1 bg-gray-700 rounded-lg appearance-none"
                    />
                </div>
            </div>
        </footer>
    );
}
