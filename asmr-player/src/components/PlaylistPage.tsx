import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ListMusic, Disc3, Play, Trash2 } from 'lucide-react';
import { usePlayerStore } from '../hooks/usePlayerStore';

interface Playlist {
    id: number;
    name: string;
    track_count: number;
}

interface PlaylistTrack {
    id: number;
    title: string;
    path: string;
    duration_sec: number | null;
    work_id: number;
    work_title: string;
    cover_path: string | null;
}

interface PlaylistPageProps {
    playlist: Playlist;
}

export function PlaylistPage({ playlist }: PlaylistPageProps) {
    const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const { setTrack, setQueue, currentTrack, isPlaying } = usePlayerStore();

    useEffect(() => {
        loadTracks();
    }, [playlist.id]);

    const loadTracks = async () => {
        try {
            setLoading(true);
            const data = await invoke<PlaylistTrack[]>('get_playlist_tracks', { playlistId: playlist.id });
            setTracks(data);
            setLoading(false);
        } catch (e) {
            console.error("Failed to load playlist tracks:", e);
            setLoading(false);
        }
    };

    const handleRemoveFromPlaylist = async (trackId: number) => {
        if (!confirm('このトラックをプレイリストから削除しますか？')) return;

        try {
            await invoke('remove_track_from_playlist', { playlistId: playlist.id, trackId });
            loadTracks();
        } catch (e) {
            console.error("Failed to remove from playlist:", e);
            alert(`エラー: ${e}`);
        }
    };

    const handlePlayAll = () => {
        if (tracks.length === 0) return;

        const mappedTracks = tracks.map(t => ({
            id: t.id,
            title: t.title,
            path: t.path,
            duration: t.duration_sec || 0,
            work_title: t.work_title,
            cover_path: t.cover_path || undefined
        }));

        setQueue(mappedTracks);
        setTrack(mappedTracks[0]);
    };

    const handlePlayTrack = (track: PlaylistTrack) => {
        const mappedTracks = tracks.map(t => ({
            id: t.id,
            title: t.title,
            path: t.path,
            duration: t.duration_sec || 0,
            work_title: t.work_title,
            cover_path: t.cover_path || undefined
        }));

        setQueue(mappedTracks);
        setTrack(mappedTracks.find(t => t.id === track.id)!);
    };

    const formatTime = (sec: number | null) => {
        if (sec === null) return '--:--';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Disc3 className="w-8 h-8 text-accent animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-white/5 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center">
                            <ListMusic className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{playlist.name}</h2>
                            <p className="text-sm text-gray-500">{tracks.length}曲</p>
                        </div>
                    </div>

                    {tracks.length > 0 && (
                        <button
                            onClick={handlePlayAll}
                            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-full font-bold hover:bg-accent-hover transition-colors shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                        >
                            <Play className="w-4 h-4" />
                            全て再生
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {tracks.length > 0 ? (
                    <div className="divide-y divide-white/5">
                        {tracks.map((track, index) => {
                            const isActive = currentTrack?.id === track.id;
                            const coverUrl = track.cover_path ? convertFileSrc(track.cover_path) : null;

                            return (
                                <div
                                    key={track.id}
                                    className={`group flex items-center gap-4 px-6 py-3 hover:bg-white/5 transition-colors ${isActive ? 'bg-white/5' : ''}`}
                                >
                                    <div className="w-8 text-center text-sm text-gray-500 font-mono">
                                        {isActive && isPlaying ? (
                                            <div className="w-3 h-3 mx-auto bg-accent rounded-full animate-pulse"></div>
                                        ) : (
                                            <span>{index + 1}</span>
                                        )}
                                    </div>

                                    <div className="w-10 h-10 rounded overflow-hidden bg-gray-800 shrink-0">
                                        {coverUrl ? (
                                            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Disc3 className="w-5 h-5 text-gray-600" />
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        className="flex-1 min-w-0 cursor-pointer"
                                        onClick={() => handlePlayTrack(track)}
                                    >
                                        <p className={`text-sm font-medium truncate ${isActive ? 'text-accent' : 'text-white'}`}>
                                            {track.title}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{track.work_title}</p>
                                    </div>

                                    <button
                                        onClick={() => handlePlayTrack(track)}
                                        className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-accent transition-all"
                                    >
                                        <Play size={16} />
                                    </button>

                                    <button
                                        onClick={() => handleRemoveFromPlaylist(track.id)}
                                        className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-400 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>

                                    <span className="text-xs text-gray-500 font-mono w-12 text-right">
                                        {formatTime(track.duration_sec)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <ListMusic className="w-16 h-16 mb-4 opacity-20" />
                        <p>プレイリストにトラックがありません</p>
                        <p className="text-sm mt-2">トラックリストの「+」ボタンから追加できます</p>
                    </div>
                )}
            </div>
        </div>
    );
}
