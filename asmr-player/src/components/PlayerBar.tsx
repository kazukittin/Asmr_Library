import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Volume2 } from 'lucide-react';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';

export function PlayerBar() {
    const { isPlaying, currentTrack, setIsPlaying, playNext, playPrev } = usePlayerStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const togglePlay = async () => {
        if (isPlaying) {
            await invoke('pause_track');
            setIsPlaying(false);
        } else {
            await invoke('resume_track');
            setIsPlaying(true);
        }
    };

    // Visualizer logic (Mock for now, will connect to FFT later)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        const resize = () => {
            if (canvas.parentElement) {
                canvas.width = canvas.parentElement.offsetWidth;
                canvas.height = canvas.parentElement.offsetHeight;
            }
        };
        resize();
        window.addEventListener('resize', resize);

        const bars = 100;
        const draw = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const w = canvas.width / bars;
            const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
            gradient.addColorStop(0, 'rgba(168, 85, 247, 0.0)');
            gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.2)');
            gradient.addColorStop(1, 'rgba(168, 85, 247, 0.4)');
            ctx.fillStyle = gradient;

            for (let i = 0; i < bars; i++) {
                const time = Date.now() / 1000;
                // Mock wave if playing, flat if not
                const amplitude = isPlaying ? 0.8 : 0.05;
                const h = Math.abs(Math.sin(i * 0.1 + time) * Math.cos(i * 0.05 - time) * canvas.height * amplitude);
                ctx.fillRect(i * w, canvas.height - h, w - 1, h);
            }
            animationId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        }
    }, [isPlaying]);

    return (
        <footer className="h-24 bg-[#0f0f12] border-t border-white/5 flex items-center justify-between px-6 z-50 relative shadow-[0_-10px_40px_rgba(0,0,0,0.5)] shrink-0">
            <canvas ref={canvasRef} className="absolute bottom-0 left-0 w-full h-full pointer-events-none opacity-20 mix-blend-screen"></canvas>

            <div className="flex items-center w-1/4 min-w-[240px] z-10">
                {currentTrack && (
                    <>
                        <div className="relative w-14 h-14 rounded-md overflow-hidden mr-4 group cursor-pointer shadow-lg">
                            <img src={currentTrack.cover_path || "https://placehold.co/100x100/2a2a35/FFF"} className="w-full h-full object-cover group-hover:opacity-50 transition" />
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
                    <span className="text-white">00:00</span>
                    <div className="relative flex-1 h-1 bg-gray-800 rounded-full group cursor-pointer">
                        <div className="absolute top-0 left-0 h-full bg-accent rounded-full w-1/3 group-hover:bg-accent-glow transition-colors"></div>
                    </div>
                    <span>00:00</span>
                </div>
            </div>

            <div className="flex items-center justify-end w-1/4 min-w-[240px] gap-4 z-10">
                <div className="flex items-center gap-2 group">
                    <Volume2 className="w-5 h-5 text-gray-400" />
                    <div className="w-20 h-1 bg-gray-700 rounded-full overflow-hidden cursor-pointer">
                        <div className="h-full bg-white w-3/4 group-hover:bg-accent transition-colors"></div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
