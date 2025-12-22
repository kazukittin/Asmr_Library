import { useState } from 'react';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { Play, ListPlus } from 'lucide-react';
import { TrackPlaylistModal } from './TrackPlaylistModal';

interface Track {
    id: number;
    title: string;
    path: string;
    duration?: number;
    work_title?: string;
    cover_path?: string;
}

export function TrackList() {
    const { queue, currentTrack, setTrack, isPlaying } = usePlayerStore();
    const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);

    if (queue.length === 0) {
        return (
            <div className="w-72 h-full border-l border-card-border bg-bg-panel p-6 flex flex-col items-center justify-center text-text-muted">
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
        <div className="w-72 h-full border-l border-card-border bg-bg-panel flex flex-col z-20 shrink-0">
            <div className="h-12 px-4 flex items-center border-b border-card-border shrink-0">
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Tracks</h2>
                <span className="ml-auto text-xs text-text-muted">{queue.length} songs</span>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
                {queue.map((track, index) => {
                    const isActive = currentTrack?.id === track.id;

                    return (
                        <div
                            key={track.id}
                            className={`
                                group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-1
                                ${isActive ? 'bg-accent/10' : 'hover:bg-bg-hover'}
                            `}
                        >
                            <div
                                className="w-6 flex justify-center text-xs text-text-muted font-mono"
                                onClick={() => setTrack(track)}
                            >
                                {isActive && isPlaying ? (
                                    <div className="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
                                ) : (
                                    <span className="group-hover:hidden">{index + 1}</span>
                                )}
                                <Play className={`w-3 h-3 text-accent hidden ${isActive ? '' : 'group-hover:block'}`} />
                            </div>

                            <div
                                className="flex-1 min-w-0 flex flex-col"
                                onClick={() => setTrack(track)}
                            >
                                <span className={`text-sm truncate font-medium ${isActive ? 'text-accent' : 'text-text-primary group-hover:text-accent'}`}>
                                    {track.title}
                                </span>
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPlaylistTrack(track);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-accent transition-all"
                                title="プレイリストに追加"
                            >
                                <ListPlus size={16} />
                            </button>

                            <span className="text-xs text-text-muted font-mono">
                                {track.duration ? formatTime(track.duration) : '--:--'}
                            </span>
                        </div>
                    );
                })}
            </div>

            {playlistTrack && (
                <TrackPlaylistModal
                    trackId={playlistTrack.id}
                    trackTitle={playlistTrack.title}
                    isOpen={true}
                    onClose={() => setPlaylistTrack(null)}
                />
            )}
        </div>
    );
}
