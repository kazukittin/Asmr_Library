import { Play, Edit2, Trash2, Heart, User, Building2, LayoutGrid, List, Grid3X3 } from 'lucide-react';
import { useLibrary, Work } from '../hooks/useLibrary';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { MetadataEditor } from './MetadataEditor';
import { useState, useMemo, useEffect } from 'react';

interface WorkGridProps {
    searchQuery?: string;
}

type ViewMode = 'large' | 'small' | 'list';
type SortMode = 'newest' | 'title' | 'rj';

export function WorkGrid({ searchQuery = '' }: WorkGridProps) {
    const { works, loading, refetch } = useLibrary();
    const { setTrack, setQueue } = usePlayerStore();
    const [editingWork, setEditingWork] = useState<Work | null>(null);
    const [favorites, setFavorites] = useState<Set<number>>(new Set());
    const [viewMode, setViewMode] = useState<ViewMode>('large');
    const [sortMode, setSortMode] = useState<SortMode>('newest');

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
    }, [works, searchQuery, sortMode]);

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
            }
        } catch (e) {
            console.error("Failed to play work:", e);
            alert(`Playback Error: ${e}`);
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

    const getGridCols = () => {
        switch (viewMode) {
            case 'small': return 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';
            case 'list': return 'grid-cols-1';
            default: return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6">
            {/* Header with title and controls */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text-primary">
                    {searchQuery ? `検索結果: "${searchQuery}"` : '全作品'}
                    <span className="text-text-muted font-normal ml-2">({filteredWorks.length})</span>
                </h2>

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

                    {/* View Mode Toggle */}
                    <div className="flex bg-bg-panel border border-card-border rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('large')}
                            className={`p-2 ${viewMode === 'large' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
                            title="大きいグリッド"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('small')}
                            className={`p-2 ${viewMode === 'small' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
                            title="小さいグリッド"
                        >
                            <Grid3X3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 ${viewMode === 'list' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-hover'}`}
                            title="リスト表示"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Works Grid */}
            <div className={`grid ${getGridCols()} gap-4 pb-20`}>
                {filteredWorks.map((work) => (
                    viewMode === 'list' ? (
                        <ListCard
                            key={work.id}
                            work={work}
                            isFavorite={favorites.has(work.id)}
                            onPlay={() => handlePlay(work)}
                            onEdit={() => setEditingWork(work)}
                            onDelete={() => handleDelete(work)}
                            onToggleFavorite={() => toggleFavorite(work.id)}
                        />
                    ) : (
                        <GridCard
                            key={work.id}
                            work={work}
                            isFavorite={favorites.has(work.id)}
                            isSmall={viewMode === 'small'}
                            onPlay={() => handlePlay(work)}
                            onEdit={() => setEditingWork(work)}
                            onDelete={() => handleDelete(work)}
                            onToggleFavorite={() => toggleFavorite(work.id)}
                        />
                    )
                ))}
            </div>

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
function GridCard({ work, isFavorite, isSmall, onPlay, onEdit, onDelete, onToggleFavorite }: {
    work: Work;
    isFavorite: boolean;
    isSmall: boolean;
    onPlay: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onToggleFavorite: () => void;
}) {
    return (
        <div className="group bg-bg-panel rounded-lg overflow-hidden card-shadow hover:card-shadow-hover transition-all duration-300 cursor-pointer">
            {/* Cover Image */}
            <div className="relative aspect-square overflow-hidden" onClick={onPlay}>
                <img
                    src={work.cover_path ? convertFileSrc(work.cover_path) : `https://placehold.co/400x400/e0e0e0/999?text=${work.rj_code || 'ASMR'}`}
                    alt={work.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* RJ Code Badge */}
                {work.rj_code && (
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">
                        {work.rj_code}
                    </div>
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
                {/* Title */}
                <h3 className={`font-bold text-text-primary line-clamp-2 leading-tight ${isSmall ? 'text-xs' : 'text-sm'}`}>
                    {work.title}
                </h3>

                {!isSmall && (
                    <>
                        {/* Tags */}
                        {work.tags && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {work.tags.split(',').slice(0, 3).map((tag, i) => (
                                    <span key={i} className="text-[10px] text-tag-text bg-tag-bg px-1.5 py-0.5 rounded">
                                        {tag.trim()}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Meta Row */}
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
                            {work.circles && (
                                <span className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3 text-circle-badge" />
                                    <span className="truncate max-w-[80px]">{work.circles}</span>
                                </span>
                            )}
                            {work.voice_actors && (
                                <span className="flex items-center gap-1">
                                    <User className="w-3 h-3 text-va-badge" />
                                    <span className="truncate max-w-[80px]">{work.voice_actors.split(',')[0]}</span>
                                </span>
                            )}
                        </div>
                    </>
                )}

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

// List Card Component
function ListCard({ work, isFavorite, onPlay, onEdit, onDelete, onToggleFavorite }: {
    work: Work;
    isFavorite: boolean;
    onPlay: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onToggleFavorite: () => void;
}) {
    return (
        <div
            className="group flex items-center gap-4 p-3 bg-bg-panel rounded-lg card-shadow hover:card-shadow-hover transition-all cursor-pointer"
            onClick={onPlay}
        >
            {/* Cover */}
            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 relative">
                <img
                    src={work.cover_path ? convertFileSrc(work.cover_path) : `https://placehold.co/100x100/e0e0e0/999?text=?`}
                    alt=""
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-6 h-6 text-white" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-text-primary truncate">{work.title}</h3>
                <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                    {work.rj_code && (
                        <span className="font-mono bg-tag-bg px-1.5 py-0.5 rounded">{work.rj_code}</span>
                    )}
                    {work.circles && (
                        <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-circle-badge" />
                            {work.circles}
                        </span>
                    )}
                    {work.voice_actors && (
                        <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-va-badge" />
                            {work.voice_actors.split(',')[0]}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                    className={`p-2 rounded-full ${isFavorite ? 'text-pink-500' : 'text-text-muted hover:text-pink-500'}`}
                >
                    <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="p-2 text-text-muted hover:text-accent rounded-full"
                >
                    <Edit2 className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-2 text-text-muted hover:text-red-500 rounded-full"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
