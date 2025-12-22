import { Play, Edit2, Trash2, Heart, User, Building2, X } from 'lucide-react';
import { useLibrary, Work } from '../hooks/useLibrary';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { MetadataEditor } from './MetadataEditor';
import { WorkDetailModal } from './WorkDetailModal';
import { useState, useMemo, useEffect } from 'react';

interface WorkGridProps {
    searchQuery?: string;
    selectedTag?: string | null;
    selectedCircle?: string | null;
    selectedVoiceActor?: string | null;
    onTagClick?: (tag: string) => void;
    onCircleClick?: (circle: string) => void;
    onVoiceActorClick?: (va: string) => void;
    onClearFilters?: () => void;
}

type SortMode = 'newest' | 'title' | 'rj';

export function WorkGrid({
    searchQuery = '',
    selectedTag = null,
    selectedCircle = null,
    selectedVoiceActor = null,
    onTagClick,
    onCircleClick,
    onVoiceActorClick,
    onClearFilters
}: WorkGridProps) {
    const { works, loading, refetch } = useLibrary();
    const { setTrack, setQueue } = usePlayerStore();
    const [editingWork, setEditingWork] = useState<Work | null>(null);
    const [selectedWork, setSelectedWork] = useState<Work | null>(null);
    const [favorites, setFavorites] = useState<Set<number>>(new Set());
    const [sortMode, setSortMode] = useState<SortMode>('newest');

    // Active filter label
    const activeFilter = selectedTag ? `タグ: ${selectedTag}` :
        selectedCircle ? `サークル: ${selectedCircle}` :
            selectedVoiceActor ? `声優: ${selectedVoiceActor}` : null;

    // Load favorites on mount
    useEffect(() => {
        invoke<number[]>('get_favorites').then(ids => {
            setFavorites(new Set(ids));
        }).catch(console.error);
    }, []);

    const toggleFavorite = async (workId: number) => {
        try {
            const isFav = await invoke<boolean>('toggle_favorite', { workId });
            setFavorites(prev => {
                const next = new Set(prev);
                if (isFav) {
                    next.add(workId);
                } else {
                    next.delete(workId);
                }
                return next;
            });
        } catch (e) {
            console.error("Failed to toggle favorite:", e);
        }
    };

    // Filter and sort works
    const filteredWorks = useMemo(() => {
        let result = works;

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(work => {
                return (
                    work.title.toLowerCase().includes(query) ||
                    (work.rj_code && work.rj_code.toLowerCase().includes(query)) ||
                    (work.voice_actors && work.voice_actors.toLowerCase().includes(query)) ||
                    (work.circles && work.circles.toLowerCase().includes(query)) ||
                    (work.tags && work.tags.toLowerCase().includes(query))
                );
            });
        }

        // Filter by selected tag
        if (selectedTag) {
            result = result.filter(work => {
                if (!work.tags) return false;
                const workTags = work.tags.split(',').map(t => t.trim().toLowerCase());
                return workTags.includes(selectedTag.toLowerCase());
            });
        }

        // Filter by selected circle
        if (selectedCircle) {
            result = result.filter(work => {
                if (!work.circles) return false;
                return work.circles.toLowerCase().includes(selectedCircle.toLowerCase());
            });
        }

        // Filter by selected voice actor
        if (selectedVoiceActor) {
            result = result.filter(work => {
                if (!work.voice_actors) return false;
                const workVAs = work.voice_actors.split(',').map(v => v.trim().toLowerCase());
                return workVAs.includes(selectedVoiceActor.toLowerCase());
            });
        }

        // Sort
        switch (sortMode) {
            case 'title':
                result = [...result].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
                break;
            case 'rj':
                result = [...result].sort((a, b) => (b.rj_code || '').localeCompare(a.rj_code || ''));
                break;
            default:
                // newest - already sorted by backend
                break;
        }

        return result;
    }, [works, searchQuery, selectedTag, selectedCircle, selectedVoiceActor, sortMode]);

    // Direct playback - plays first track immediately
    const handlePlay = async (work: Work) => {
        try {
            const tracks = await invoke<any[]>('get_work_tracks', { workId: work.id });

            if (tracks && tracks.length > 0) {
                const mappedTracks = tracks.map(t => ({
                    id: t.id,
                    title: t.title,
                    path: t.path,
                    duration: t.duration || 0,
                    work_title: work.title,
                    cover_path: work.cover_path || undefined
                }));

                setQueue(mappedTracks);
                setTrack(mappedTracks[0]);

                // Add to history
                await invoke('add_to_history', { workId: work.id, trackId: tracks[0].id }).catch(console.error);
            }
        } catch (e) {
            console.error("Failed to play work:", e);
        }
    };

    const handleDelete = async (work: Work) => {
        if (!confirm(`「${work.title}」を削除しますか？\n\n⚠️ ファイルも削除されます。`)) {
            return;
        }

        try {
            await invoke('delete_work', { workId: work.id, deleteFiles: true });
            refetch();
        } catch (e) {
            console.error("Failed to delete work:", e);
            alert(`削除エラー: ${e}`);
        }
    };

    if (loading) return (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-text-secondary">読み込み中...</div>
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto p-6">
            {/* Header with title and controls */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-text-primary">
                        {searchQuery ? `検索結果: "${searchQuery}"` : activeFilter ? activeFilter : '全作品'}
                        <span className="text-text-muted font-normal ml-2">({filteredWorks.length})</span>
                    </h2>
                    {activeFilter && onClearFilters && (
                        <button
                            onClick={onClearFilters}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-accent text-white rounded-full hover:bg-accent/80 transition-colors"
                        >
                            クリア
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Utility Bar */}
                <div className="flex items-center gap-4">
                    {/* Sort Dropdown */}
                    <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value as SortMode)}
                        className="bg-bg-panel border border-card-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                    >
                        <option value="newest">新着順</option>
                        <option value="title">タイトル順</option>
                        <option value="rj">RJ番号順</option>
                    </select>
                </div>
            </div>

            {/* Works Grid - Large only */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
                {filteredWorks.map((work) => (
                    <GridCard
                        key={work.id}
                        work={work}
                        isFavorite={favorites.has(work.id)}
                        onPlay={() => handlePlay(work)}
                        onOpenDetail={() => setSelectedWork(work)}
                        onEdit={() => setEditingWork(work)}
                        onDelete={() => handleDelete(work)}
                        onToggleFavorite={() => toggleFavorite(work.id)}
                        onTagClick={onTagClick}
                        onCircleClick={onCircleClick}
                        onVoiceActorClick={onVoiceActorClick}
                    />
                ))}
            </div>

            {/* Work Detail Modal */}
            {selectedWork && (
                <WorkDetailModal
                    work={selectedWork}
                    isOpen={!!selectedWork}
                    onClose={() => setSelectedWork(null)}
                />
            )}

            {editingWork && (
                <MetadataEditor
                    work={editingWork}
                    isOpen={!!editingWork}
                    onClose={() => setEditingWork(null)}
                    onSave={() => {
                        refetch();
                    }}
                />
            )}
        </div>
    );
}

// Grid Card Component (ASMR.one Style)
function GridCard({ work, isFavorite, onPlay, onOpenDetail, onEdit, onDelete, onToggleFavorite, onTagClick, onCircleClick, onVoiceActorClick }: {
    work: Work;
    isFavorite: boolean;
    onPlay: () => void;
    onOpenDetail: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onToggleFavorite: () => void;
    onTagClick?: (tag: string) => void;
    onCircleClick?: (circle: string) => void;
    onVoiceActorClick?: (va: string) => void;
}) {
    return (
        <div className="group bg-bg-panel rounded-lg overflow-hidden card-shadow hover:card-shadow-hover transition-all duration-300 cursor-pointer">
            {/* Cover Image - Click to play directly */}
            <div className="relative aspect-square overflow-hidden" onClick={onPlay}>
                <img
                    src={work.cover_path ? convertFileSrc(work.cover_path) : `https://placehold.co/400x400/e0e0e0/999?text=${work.rj_code || 'ASMR'}`}
                    alt={work.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* RJ Code Badge - Click for details */}
                {work.rj_code && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
                        className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm hover:bg-accent transition-colors"
                    >
                        {work.rj_code}
                    </button>
                )}

                {/* Favorite Button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                    className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isFavorite
                        ? 'bg-pink-500 text-white'
                        : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                        }`}
                >
                    <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                </button>

                {/* Play Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 ml-1" />
                    </div>
                </div>
            </div>

            {/* Card Content */}
            <div className="p-3">
                {/* Title - Click to open details */}
                <h3
                    onClick={onOpenDetail}
                    className="font-bold text-text-primary line-clamp-2 leading-tight text-sm hover:text-accent transition-colors cursor-pointer"
                >
                    {work.title}
                </h3>

                {/* Tags - Clickable */}
                {work.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {work.tags.split(',').slice(0, 3).map((tag, i) => (
                            <button
                                key={i}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTagClick?.(tag.trim());
                                }}
                                className="text-[10px] text-tag-text bg-tag-bg px-1.5 py-0.5 rounded hover:bg-accent hover:text-white transition-colors"
                            >
                                {tag.trim()}
                            </button>
                        ))}
                    </div>
                )}

                {/* Meta Row - Clickable */}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
                    {work.circles && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onCircleClick?.(work.circles!);
                            }}
                            className="flex items-center gap-1 hover:text-accent transition-colors"
                        >
                            <Building2 className="w-3 h-3 text-circle-badge" />
                            <span className="truncate max-w-[80px]">{work.circles}</span>
                        </button>
                    )}
                    {work.voice_actors && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onVoiceActorClick?.(work.voice_actors!.split(',')[0].trim());
                            }}
                            className="flex items-center gap-1 hover:text-accent transition-colors"
                        >
                            <User className="w-3 h-3 text-va-badge" />
                            <span className="truncate max-w-[80px]">{work.voice_actors.split(',')[0]}</span>
                        </button>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="p-1.5 text-text-muted hover:text-accent rounded hover:bg-bg-hover transition-colors"
                        title="編集"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 text-text-muted hover:text-red-500 rounded hover:bg-bg-hover transition-colors"
                        title="削除"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
