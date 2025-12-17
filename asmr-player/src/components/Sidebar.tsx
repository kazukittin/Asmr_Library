import { Library, Mic, Tag, FolderPlus, ListMusic, Plus, Trash2, History, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { PageType, Playlist } from '../App';

interface PlayHistoryItem {
    id: number;
    work_id: number;
    work_title: string;
    track_id: number;
    track_title: string;
    cover_path: string | null;
    played_at: string;
}

interface SidebarProps {
    currentPage: PageType;
    onPageChange: (page: PageType) => void;
    onPlaylistSelect: (playlist: Playlist) => void;
    selectedPlaylistId?: number;
}

export function Sidebar({ currentPage, onPageChange, onPlaylistSelect, selectedPlaylistId }: SidebarProps) {
    const [scanCount, setScanCount] = useState(0);
    const [scanning, setScanning] = useState(false);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<PlayHistoryItem[]>([]);
    const [batchScraping, setBatchScraping] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

    useEffect(() => {
        const unlisten = listen('scan-progress', (event) => {
            setScanCount(event.payload as number);
            setScanning(true);
        });

        loadPlaylists();

        return () => {
            unlisten.then(f => f());
        }
    }, []);

    const loadPlaylists = async () => {
        try {
            const data = await invoke<Playlist[]>('get_all_playlists');
            setPlaylists(data);
        } catch (e) {
            console.error("Failed to load playlists:", e);
        }
    };

    const handleScan = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "ASMRライブラリフォルダを選択"
            });

            if (selected) {
                setScanning(true);
                setScanCount(0);
                await invoke('scan_library', { rootPath: selected });
                setScanning(false);
            }
        } catch (err) {
            console.error(err);
            setScanning(false);
        }
    };

    const handleCreatePlaylist = async () => {
        if (!newName.trim()) return;
        try {
            await invoke('create_playlist', { name: newName.trim() });
            setNewName('');
            setIsCreating(false);
            loadPlaylists();
        } catch (e) {
            console.error("Failed to create playlist:", e);
        }
    };

    const handleDeletePlaylist = async (e: React.MouseEvent, playlistId: number) => {
        e.stopPropagation();
        if (!confirm('このプレイリストを削除しますか？')) return;
        try {
            await invoke('delete_playlist', { playlistId });
            loadPlaylists();
            if (selectedPlaylistId === playlistId) {
                onPageChange('library');
            }
        } catch (e) {
            console.error("Failed to delete playlist:", e);
        }
    };

    const loadHistory = async () => {
        try {
            const data = await invoke<PlayHistoryItem[]>('get_play_history', { limit: 20 });
            setHistory(data);
            setShowHistory(true);
        } catch (e) {
            console.error("Failed to load history:", e);
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
        } catch (e) {
            console.error("Batch scrape failed:", e);
            alert('一括取得に失敗しました。');
        } finally {
            setBatchScraping(false);
            setBatchProgress(null);
            unlisten();
        }
    };

    const navItems: { page: PageType; icon: typeof Library; label: string; iconColor?: string }[] = [
        { page: 'library', icon: Library, label: '最近追加された作品', iconColor: 'text-accent' },
        { page: 'voice-actors', icon: Mic, label: '声優 (CV)', iconColor: 'text-gray-500' },
        { page: 'tags', icon: Tag, label: 'タグ / ジャンル', iconColor: 'text-gray-500' },
    ];

    return (
        <aside className="w-64 bg-bg-sidebar flex flex-col border-r border-white/5 z-20 h-full">
            <div className="h-16 flex items-center px-6 border-b border-white/5 shrink-0 justify-between">
                <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-accent mr-3 shadow-[0_0_10px_#a855f7]"></div>
                    <span className="font-bold text-lg tracking-wide text-white">ASMR Player</span>
                </div>
            </div>

            <div className="p-3 space-y-2">
                <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="w-full flex items-center justify-center px-3 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/5"
                >
                    <FolderPlus className="w-4 h-4 mr-2" />
                    <span className="text-sm">{scanning ? 'スキャン中...' : 'ライブラリ更新'}</span>
                </button>

                <div className="flex gap-2">
                    <button
                        onClick={loadHistory}
                        className="flex-1 flex items-center justify-center px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors border border-white/5 text-sm"
                        title="再生履歴"
                    >
                        <History className="w-4 h-4 mr-1" />
                        履歴
                    </button>
                    <button
                        onClick={handleBatchScrape}
                        disabled={batchScraping}
                        className="flex-1 flex items-center justify-center px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors border border-white/5 text-sm"
                        title="一括メタデータ取得"
                    >
                        <Download className="w-4 h-4 mr-1" />
                        {batchScraping ? `${batchProgress?.current || 0}/${batchProgress?.total || '?'}` : '一括取得'}
                    </button>
                </div>
            </div>

            {/* Play History Modal */}
            {showHistory && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowHistory(false)}>
                    <div className="bg-bg-panel rounded-xl p-6 w-[500px] max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">再生履歴</h2>
                            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="overflow-y-auto flex-1 space-y-2 custom-scrollbar">
                            {history.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">履歴がありません</p>
                            ) : (
                                history.map(item => (
                                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                                        <div className="w-10 h-10 bg-gray-800 rounded overflow-hidden shrink-0">
                                            {item.cover_path && (
                                                <img src={`asset://localhost/${item.cover_path}`} alt="" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-white text-sm truncate">{item.track_title}</div>
                                            <div className="text-gray-500 text-xs truncate">{item.work_title}</div>
                                        </div>
                                        <div className="text-gray-500 text-xs shrink-0">
                                            {new Date(item.played_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1 custom-scrollbar">
                <div className="px-3 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">ライブラリ</div>

                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.page && currentPage !== 'playlist';
                    return (
                        <button
                            key={item.page}
                            onClick={() => onPageChange(item.page)}
                            className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors text-left ${isActive
                                ? 'text-white bg-white/5'
                                : 'text-gray-400 hover:text-white hover:bg-bg-hover'
                                }`}
                        >
                            <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-accent' : item.iconColor}`} />
                            {item.label}
                        </button>
                    );
                })}

                <div className="mt-6 px-3 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                    <span>プレイリスト</span>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="text-gray-500 hover:text-accent transition-colors"
                        title="新規プレイリスト"
                    >
                        <Plus size={14} />
                    </button>
                </div>

                {isCreating && (
                    <div className="px-1 mb-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="プレイリスト名..."
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-accent"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreatePlaylist();
                                if (e.key === 'Escape') { setIsCreating(false); setNewName(''); }
                            }}
                            onBlur={() => { if (!newName.trim()) setIsCreating(false); }}
                        />
                    </div>
                )}

                {playlists.map((playlist) => {
                    const isActive = currentPage === 'playlist' && selectedPlaylistId === playlist.id;
                    return (
                        <button
                            key={playlist.id}
                            onClick={() => onPlaylistSelect(playlist)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left group ${isActive
                                ? 'text-white bg-white/5'
                                : 'text-gray-400 hover:text-white hover:bg-bg-hover'
                                }`}
                        >
                            <div className="flex items-center min-w-0">
                                <ListMusic className={`w-5 h-5 mr-3 shrink-0 ${isActive ? 'text-accent' : 'text-gray-500'}`} />
                                <span className="truncate">{playlist.name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-gray-500">{playlist.track_count}</span>
                                <button
                                    onClick={(e) => handleDeletePlaylist(e, playlist.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </button>
                    );
                })}

                {playlists.length === 0 && !isCreating && (
                    <p className="px-3 text-xs text-gray-600">プレイリストなし</p>
                )}
            </nav>

            <div className="p-4 border-t border-white/5 bg-black/20 shrink-0">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>スキャン状況</span>
                    <span className={`text-green-500 ${scanning ? 'animate-pulse' : ''}`}>{scanning ? `スキャン中... (${scanCount})` : '待機中'}</span>
                </div>
                <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-accent w-2/3 rounded-full"></div>
                </div>
            </div>
        </aside>
    );
}
