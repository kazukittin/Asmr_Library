import { Play, Edit2, Trash2, Heart, Download, FolderPlus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useLibrary, Work } from '../hooks/useLibrary';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MetadataEditor } from './MetadataEditor';
import { useState, useMemo, useEffect } from 'react';

interface WorkGridProps {
    searchQuery?: string;
}

export function WorkGrid({ searchQuery = '' }: WorkGridProps) {
    const { works, loading, refetch } = useLibrary();
    const { setTrack, setQueue } = usePlayerStore();
    const [editingWork, setEditingWork] = useState<Work | null>(null);
    const [favorites, setFavorites] = useState<Set<number>>(new Set());
    const [batchScraping, setBatchScraping] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
    const [scanning, setScanning] = useState(false);

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

    // Filter works based on search query
    const filteredWorks = useMemo(() => {
        if (!searchQuery.trim()) return works;

        const query = searchQuery.toLowerCase().trim();
        return works.filter(work => {
            return (
                work.title.toLowerCase().includes(query) ||
                (work.rj_code && work.rj_code.toLowerCase().includes(query)) ||
                (work.voice_actors && work.voice_actors.toLowerCase().includes(query)) ||
                (work.circles && work.circles.toLowerCase().includes(query)) ||
                (work.tags && work.tags.toLowerCase().includes(query))
            );
        });
    }, [works, searchQuery]);

    const handlePlay = async (work: Work) => {
        try {
            console.log("Fetching tracks for work:", work.title);
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
            } else {
                console.warn("No tracks found for work.");
            }
        } catch (e) {
            console.error("Failed to play work:", e);
            alert(`Playback Error: ${e}`);
        }
    };

    const handleDelete = async (work: Work) => {
        if (!confirm(`「${work.title}」を削除しますか？\n\n⚠️ ファイルも削除されます。この操作は取り消せません。`)) {
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

    const handleBatchScrape = async () => {
        if (batchScraping) return;

        setBatchScraping(true);
        setBatchProgress(null);

        const unlisten = await listen<{ current: number; total: number }>('batch-scrape-progress', (event) => {
            setBatchProgress(event.payload);
        });

        try {
            const count = await invoke<number>('batch_scrape_metadata');
            alert(`${count} 件の作品のメタデータを取得しました。`);
            refetch();
        } catch (e) {
            console.error("Batch scrape failed:", e);
            alert('一括取得に失敗しました。');
        } finally {
            setBatchScraping(false);
            setBatchProgress(null);
            unlisten();
        }
    };

    const handleRescan = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "ASMRライブラリフォルダを選択"
            });

            if (selected) {
                setScanning(true);
                await invoke('scan_library', { rootPath: selected });
                refetch();
                setScanning(false);
            }
        } catch (err) {
            console.error(err);
            setScanning(false);
        }
    };

    if (loading) return <div className="p-8 text-white">読み込み中...</div>;

    return (
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="flex items-end justify-between mb-6">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                    {searchQuery ? `検索結果: "${searchQuery}"` : '最近追加された作品'}
                </h2>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRescan}
                        disabled={scanning}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-sm rounded-lg transition-all border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="フォルダを選択してライブラリを更新"
                    >
                        <FolderPlus className="w-4 h-4" />
                        {scanning ? 'スキャン中...' : 'フォルダ追加'}
                    </button>
                    <button
                        onClick={handleBatchScrape}
                        disabled={batchScraping}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 text-white text-sm rounded-lg transition-all border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="RJコードを元にDLsiteからメタデータを一括取得"
                    >
                        <Download className="w-4 h-4" />
                        {batchScraping
                            ? `取得中 (${batchProgress?.current || 0}/${batchProgress?.total || '?'})`
                            : 'メタデータ一括取得'}
                    </button>
                    <span className="text-sm text-gray-500">{filteredWorks.length} 作品</span>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 pb-20">
                {filteredWorks.map((work) => (
                    <div key={work.id} className="group relative flex flex-col cursor-pointer">
                        <div className="aspect-[2/3] w-full rounded-xl overflow-hidden relative bg-bg-panel shadow-lg shadow-black/50 group-hover:shadow-accent/20 transition-all duration-300 transform group-hover:-translate-y-1 ring-1 ring-white/5 group-hover:ring-accent/50">
                            <img
                                src={work.cover_path ? convertFileSrc(work.cover_path) : `https://placehold.co/400x600/2a2a35/FFF?text=${work.rj_code || 'ASMR'}`}
                                alt={work.title}
                                className="w-full h-full object-cover transition duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                            />

                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px] gap-2">
                                <button
                                    className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.6)] hover:scale-105 transition-transform"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlay(work);
                                    }}
                                >
                                    <Play className="w-5 h-5 ml-1" />
                                </button>

                                <button
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all backdrop-blur-sm ${favorites.has(work.id)
                                        ? 'bg-pink-500/50 text-pink-300'
                                        : 'bg-white/10 text-white hover:bg-pink-500/30'
                                        }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(work.id);
                                    }}
                                    title={favorites.has(work.id) ? 'お気に入りから削除' : 'お気に入りに追加'}
                                >
                                    <Heart className={`w-4 h-4 ${favorites.has(work.id) ? 'fill-current' : ''}`} />
                                </button>

                                <button
                                    className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all backdrop-blur-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingWork(work);
                                    }}
                                    title="情報を編集"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>

                                <button
                                    className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-red-500/50 transition-all backdrop-blur-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(work);
                                    }}
                                    title="削除"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                                {work.rj_code && (
                                    <button
                                        className="bg-black/80 backdrop-blur-md text-[10px] font-bold text-pink-400 px-2 py-0.5 rounded border border-pink-500/30 hover:bg-pink-500 hover:text-white transition-colors cursor-pointer z-20"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (confirm(`'${work.title}' の情報をDLsiteから取得しますか？`)) {
                                                try {
                                                    await invoke('scrape_work_metadata', { workId: work.id });
                                                    refetch(); // Use refetch from hook
                                                } catch (err) {
                                                    alert(`エラー: ${err}`);
                                                }
                                            }
                                        }}
                                        title="DLsiteから情報を取得"
                                    >
                                        DLsite
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="mt-3">
                            <h3 className="text-sm font-bold text-gray-200 truncate group-hover:text-accent transition-colors">
                                {work.title}
                            </h3>
                            <div className="flex justify-between items-center mt-1 text-xs">
                                <p className="text-gray-400 truncate max-w-[70%]">
                                    {work.voice_actors || work.circles || "Circle/CV 未設定"}
                                </p>
                                {work.rj_code && (
                                    <span className="text-[10px] text-gray-600 font-mono bg-white/5 px-1 rounded">
                                        {work.rj_code}
                                    </span>
                                )}
                            </div>
                            {work.tags && (
                                <div className="flex flex-wrap gap-1 mt-1.5 overflow-hidden h-4">
                                    {work.tags.split(',').slice(0, 3).map((tag, i) => (
                                        <span key={i} className="text-[9px] text-gray-400 bg-white/5 px-1.5 rounded-sm whitespace-nowrap">
                                            {tag.trim()}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
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

