import { X, Play, Clock, User, Building2, Tag, Music2 } from 'lucide-react';
import { Work } from '../hooks/useLibrary';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

interface Track {
    id: number;
    work_id: number;
    title: string;
    path: string;
    duration: number;
}

interface WorkDetailModalProps {
    work: Work;
    isOpen: boolean;
    onClose: () => void;
}

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function WorkDetailModal({ work, isOpen, onClose }: WorkDetailModalProps) {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [loading, setLoading] = useState(true);
    const { setTrack, setQueue, currentTrack, isPlaying } = usePlayerStore();

    useEffect(() => {
        if (isOpen && work) {
            loadTracks();
        }
    }, [isOpen, work]);

    const loadTracks = async () => {
        try {
            setLoading(true);
            const data = await invoke<Track[]>('get_work_tracks', { workId: work.id });
            setTracks(data);
        } catch (e) {
            console.error("Failed to load tracks:", e);
        } finally {
            setLoading(false);
        }
    };

    const handlePlayTrack = async (track: Track) => {
        // Add to history
        await invoke('add_to_history', { workId: work.id, trackId: track.id }).catch(console.error);

        // Build the queue with all tracks
        const queueTracks = tracks.map(t => ({
            id: t.id,
            title: t.title,
            path: t.path,
            duration: t.duration,
            work_title: work.title,
            cover_path: work.cover_path || undefined,
        }));

        // Set queue first, then set the specific track
        setQueue(queueTracks);
        setTrack({
            id: track.id,
            title: track.title,
            path: track.path,
            duration: track.duration,
            work_title: work.title,
            cover_path: work.cover_path || undefined,
        });
    };

    const handlePlayAll = () => {
        if (tracks.length > 0) {
            handlePlayTrack(tracks[0]);
        }
    };

    if (!isOpen) return null;

    const tags = work.tags?.split(',').map(t => t.trim()).filter(Boolean) || [];
    const voiceActors = work.voice_actors?.split(',').map(v => v.trim()).filter(Boolean) || [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with blur */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white/95 dark:bg-gray-900/95 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden backdrop-blur-xl border border-white/20">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col md:flex-row h-full max-h-[85vh]">
                    {/* Left: Cover & Info */}
                    <div className="md:w-2/5 p-6 bg-gradient-to-br from-accent/20 to-accent/5">
                        {/* Cover Image */}
                        <div className="relative aspect-square rounded-xl overflow-hidden shadow-2xl mb-6">
                            <img
                                src={work.cover_path ? convertFileSrc(work.cover_path) : `https://placehold.co/400x400/e0e0e0/999?text=${work.rj_code || 'ASMR'}`}
                                alt={work.title}
                                className="w-full h-full object-cover"
                            />
                            {/* RJ Code Badge */}
                            {work.rj_code && (
                                <div className="absolute top-3 left-3 bg-black/70 text-white text-sm font-bold px-3 py-1 rounded-full backdrop-blur-sm">
                                    {work.rj_code}
                                </div>
                            )}
                        </div>

                        {/* Title */}
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 line-clamp-3">
                            {work.title}
                        </h2>

                        {/* Meta Info */}
                        <div className="space-y-3 text-sm">
                            {/* Circle */}
                            {work.circles && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                    <Building2 className="w-4 h-4 text-accent" />
                                    <span>{work.circles}</span>
                                </div>
                            )}

                            {/* Voice Actors */}
                            {voiceActors.length > 0 && (
                                <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                    <User className="w-4 h-4 text-pink-500 mt-0.5" />
                                    <div className="flex flex-wrap gap-1">
                                        {voiceActors.map((va, i) => (
                                            <span key={i} className="bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded-full text-xs">
                                                {va}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Tags */}
                            {tags.length > 0 && (
                                <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                    <Tag className="w-4 h-4 text-accent mt-0.5" />
                                    <div className="flex flex-wrap gap-1">
                                        {tags.slice(0, 8).map((tag, i) => (
                                            <span key={i} className="bg-accent/10 text-accent px-2 py-0.5 rounded-full text-xs">
                                                {tag}
                                            </span>
                                        ))}
                                        {tags.length > 8 && (
                                            <span className="text-gray-400 text-xs">+{tags.length - 8}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Play All Button */}
                        <button
                            onClick={handlePlayAll}
                            disabled={tracks.length === 0}
                            className="w-full mt-6 py-3 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
                        >
                            <Play className="w-5 h-5" />
                            すべて再生
                        </button>
                    </div>

                    {/* Right: Track List */}
                    <div className="md:w-3/5 flex flex-col">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Music2 className="w-5 h-5 text-accent" />
                                トラック一覧
                                <span className="text-gray-400 font-normal text-sm">({tracks.length})</span>
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-1">
                            {loading ? (
                                <div className="text-center py-8 text-gray-400">読み込み中...</div>
                            ) : tracks.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">トラックがありません</div>
                            ) : (
                                tracks.map((track) => {
                                    const isCurrentTrack = currentTrack?.id === track.id;
                                    return (
                                        <button
                                            key={track.id}
                                            onClick={() => handlePlayTrack(track)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all group ${isCurrentTrack
                                                ? 'bg-accent text-white'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                                                }`}
                                        >
                                            {/* Track Number / Play Icon */}
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isCurrentTrack
                                                ? 'bg-white/20'
                                                : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-accent group-hover:text-white'
                                                }`}>
                                                {isCurrentTrack && isPlaying ? (
                                                    <div className="flex items-center gap-0.5">
                                                        <div className="w-0.5 h-3 bg-white animate-pulse" />
                                                        <div className="w-0.5 h-4 bg-white animate-pulse" style={{ animationDelay: '0.1s' }} />
                                                        <div className="w-0.5 h-2 bg-white animate-pulse" style={{ animationDelay: '0.2s' }} />
                                                    </div>
                                                ) : (
                                                    <Play className="w-3.5 h-3.5" />
                                                )}
                                            </div>

                                            {/* Track Info */}
                                            <div className="flex-1 text-left min-w-0">
                                                <div className={`font-medium truncate ${isCurrentTrack ? 'text-white' : ''}`}>
                                                    {track.title}
                                                </div>
                                            </div>

                                            {/* Duration */}
                                            <div className={`text-sm shrink-0 ${isCurrentTrack ? 'text-white/80' : 'text-gray-400'}`}>
                                                <Clock className="w-3 h-3 inline mr-1" />
                                                {formatDuration(track.duration)}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
