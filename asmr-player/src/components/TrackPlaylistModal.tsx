import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Plus, ListMusic } from 'lucide-react';

interface Playlist {
    id: number;
    name: string;
    track_count: number;
}

interface TrackPlaylistModalProps {
    trackId: number;
    trackTitle: string;
    isOpen: boolean;
    onClose: () => void;
}

export function TrackPlaylistModal({ trackId, trackTitle, isOpen, onClose }: TrackPlaylistModalProps) {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            loadPlaylists();
        }
    }, [isOpen]);

    const loadPlaylists = async () => {
        try {
            const data = await invoke<Playlist[]>('get_all_playlists');
            setPlaylists(data);
            setLoading(false);
        } catch (e) {
            console.error("Failed to load playlists:", e);
            setLoading(false);
        }
    };

    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim()) return;

        try {
            await invoke('create_playlist', { name: newPlaylistName.trim() });
            setNewPlaylistName('');
            setIsCreating(false);
            loadPlaylists();
        } catch (e) {
            console.error("Failed to create playlist:", e);
            alert(`エラー: ${e}`);
        }
    };

    const handleAddToPlaylist = async (playlistId: number) => {
        try {
            await invoke('add_track_to_playlist', { playlistId, trackId });
            onClose();
        } catch (e) {
            console.error("Failed to add to playlist:", e);
            alert(`エラー: ${e}`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-bg-panel w-[400px] rounded-xl shadow-2xl border border-white/10 p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <ListMusic className="w-5 h-5 text-accent" />
                    プレイリストに追加
                </h2>
                <p className="text-sm text-gray-400 mb-4 truncate">
                    「{trackTitle}」
                </p>

                {loading ? (
                    <div className="py-8 text-center text-gray-500">読み込み中...</div>
                ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {playlists.map((playlist) => (
                            <button
                                key={playlist.id}
                                onClick={() => handleAddToPlaylist(playlist.id)}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 hover:bg-accent/20 transition-colors text-left"
                            >
                                <span className="text-white">{playlist.name}</span>
                                <span className="text-xs text-gray-500">{playlist.track_count}曲</span>
                            </button>
                        ))}

                        {playlists.length === 0 && !isCreating && (
                            <p className="text-gray-500 text-sm text-center py-4">
                                プレイリストがありません
                            </p>
                        )}
                    </div>
                )}

                <div className="mt-4 pt-4 border-t border-white/10">
                    {isCreating ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newPlaylistName}
                                onChange={(e) => setNewPlaylistName(e.target.value)}
                                placeholder="プレイリスト名..."
                                className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreatePlaylist();
                                    if (e.key === 'Escape') setIsCreating(false);
                                }}
                            />
                            <button
                                onClick={handleCreatePlaylist}
                                className="px-4 py-2 bg-accent text-white rounded text-sm font-bold hover:bg-accent-hover transition-colors"
                            >
                                作成
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-dashed border-white/20 text-gray-400 hover:text-white hover:border-accent transition-colors"
                        >
                            <Plus size={16} />
                            新規プレイリスト
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
