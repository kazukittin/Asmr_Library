
import { usePlayerStore } from '../hooks/usePlayerStore';
import { Play } from 'lucide-react';

export function TrackList() {
    const { queue, currentTrack, setTrack, isPlaying } = usePlayerStore();

    if (queue.length === 0) {
        return (
            <div className="w-80 h-full border-l border-white/5 bg-[#121216] p-6 flex flex-col items-center justify-center text-gray-500">
                <span className="text-sm">再生中のトラックはありません</span>
            </div>
        );
    }

    const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-80 h-full border-l border-white/5 bg-[#121216] flex flex-col z-20 shrink-0">
            <div className="h-16 px-6 flex items-center border-b border-white/5 shrink-0">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Tracks</h2>
                <span className="ml-auto text-xs text-gray-500">{queue.length} songs</span>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
                {queue.map((track, index) => {
                    const isActive = currentTrack?.id === track.id;

                    return (
                        <div
                            key={track.id}
                            onClick={() => setTrack(track)}
                            className={`
                                group flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all mb-1
                                ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}
                            `}
                        >
                            <div className="w-6 flex justify-center text-xs text-gray-500 font-mono">
                                {isActive && isPlaying ? (
                                    <div className="w-3 h-3 bg-accent rounded-full animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                                ) : (
                                    <span className="group-hover:hidden">{index + 1}</span>
                                )}
                                <Play className={`w-3 h-3 text-white hidden ${isActive ? '' : 'group-hover:block'}`} />
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col">
                                <span className={`text-sm truncate font-medium ${isActive ? 'text-accent' : 'text-gray-300 group-hover:text-white'}`}>
                                    {track.title}
                                </span>
                            </div>

                            <span className="text-xs text-gray-500 font-mono">
                                {track.duration ? formatTime(track.duration) : '--:--'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
