import { Library, Mic, Tag, FolderPlus, ListMusic, Plus, Trash2, History, Download, ChevronRight, Home, RefreshCw } from 'lucide-react';
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
    const [expanded, setExpanded] = useState(false);
    const [cleaning, setCleaning] = useState(false);

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

    const handleCleanup = async () => {
        if (cleaning) return;

        setCleaning(true);
        try {
            const count = await invoke<number>('cleanup_orphaned_works');
            if (count > 0) {
                alert(`${count} 件の存在しない作品を削除しました。`);
                // Trigger a page refresh
                window.location.reload();
            } else {
                alert('削除する作品はありませんでした。');
            }
        } catch (e) {
            console.error("Cleanup failed:", e);
            alert('クリーンアップに失敗しました。');
        } finally {
            setCleaning(false);
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
            // Refresh page to show updated titles
            window.location.reload();
        } catch (e) {
            console.error("Batch scrape failed:", e);
            alert('一括取得に失敗しました。');
        } finally {
            setBatchScraping(false);
            setBatchProgress(null);
            unlisten();
        }
    };

    const navItems: { page: PageType; icon: typeof Library; label: string }[] = [
        { page: 'library', icon: Home, label: '作品一覧' },
        { page: 'voice-actors', icon: Mic, label: '声優 (CV)' },
        { page: 'tags', icon: Tag, label: 'タグ' },
    ];

    const actionItems = [
        { icon: FolderPlus, label: scanning ? 'スキャン中...' : 'フォルダ追加', onClick: handleScan, disabled: scanning },
        { icon: Download, label: batchScraping ? `${batchProgress?.current || 0}/${batchProgress?.total || '?'}` : 'メタデータ取得', onClick: handleBatchScrape, disabled: batchScraping },
        { icon: RefreshCw, label: cleaning ? 'クリーンアップ中...' : '不要データ削除', onClick: handleCleanup, disabled: cleaning },
        { icon: History, label: '再生履歴', onClick: loadHistory, disabled: false },
    ];

    return (
        <>
            <aside
                className={`bg-bg-sidebar flex flex-col z-20 h-full transition-all duration-300 ${expanded ? 'w-56' : 'w-16'
                    }`}
                onMouseEnter={() => setExpanded(true)}
                onMouseLeave={() => setExpanded(false)}
            >
                {/* Navigation */}
                <nav className="flex-1 py-4 space-y-1 overflow-hidden sidebar-scroll">
                    {/* Main Nav */}
                    <div className="px-2 space-y-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = currentPage === item.page && currentPage !== 'playlist';
                            return (
                                <button
                                    key={item.page}
                                    onClick={() => onPageChange(item.page)}
                                    className={`w-full flex items-center px-3 py-3 rounded-lg transition-all ${isActive
                                        ? 'bg-accent text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    title={!expanded ? item.label : undefined}
                                >
                                    <Icon className="w-5 h-5 shrink-0" />
                                    <span className={`ml-3 text-sm font-medium whitespace-nowrap transition-opacity ${expanded ? 'opacity-100' : 'opacity-0 w-0'
                                        }`}>
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Divider */}
                    <div className="my-3 mx-3 border-t border-white/10"></div>

                    {/* Actions */}
                    <div className="px-2 space-y-1">
                        {actionItems.map((item, idx) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={idx}
                                    onClick={item.onClick}
                                    disabled={item.disabled}
                                    className="w-full flex items-center px-3 py-3 rounded-lg transition-all text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
                                    title={!expanded ? item.label : undefined}
                                >
                                    <Icon className="w-5 h-5 shrink-0" />
                                    <span className={`ml-3 text-sm whitespace-nowrap transition-opacity ${expanded ? 'opacity-100' : 'opacity-0 w-0'
                                        }`}>
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Divider */}
                    <div className="my-3 mx-3 border-t border-white/10"></div>

                    {/* Playlists */}
                    <div className="px-2">
                        <div className={`flex items-center justify-between px-3 py-2 ${expanded ? '' : 'justify-center'}`}>
                            {expanded && (
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    プレイリスト
                                </span>
                            )}
                            <button
                                onClick={() => setIsCreating(true)}
                                className="text-gray-500 hover:text-accent transition-colors p-1"
                                title="新規プレイリスト"
                            >
                                <Plus size={16} />
                            </button>
                        </div>

                        {isCreating && expanded && (
                            <div className="px-1 mb-2">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="名前..."
                                    className="w-full bg-black/30 border border-white/20 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-accent"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreatePlaylist();
                                        if (e.key === 'Escape') { setIsCreating(false); setNewName(''); }
                                    }}
                                    onBlur={() => { if (!newName.trim()) setIsCreating(false); }}
                                />
                            </div>
                        )}

                        <div className="space-y-1">
                            {playlists.map((playlist) => {
                                const isActive = currentPage === 'playlist' && selectedPlaylistId === playlist.id;
                                return (
                                    <button
                                        key={playlist.id}
                                        onClick={() => onPlaylistSelect(playlist)}
                                        className={`w-full flex items-center px-3 py-2 rounded-lg transition-all group ${isActive
                                            ? 'bg-accent text-white'
                                            : 'text-gray-400 hover:text-white hover:bg-white/10'
                                            }`}
                                        title={!expanded ? playlist.name : undefined}
                                    >
                                        <ListMusic className="w-5 h-5 shrink-0" />
                                        {expanded && (
                                            <>
                                                <span className="ml-3 text-sm truncate flex-1 text-left">{playlist.name}</span>
                                                <span className="text-xs text-gray-500 mr-1">{playlist.track_count}</span>
                                                <button
                                                    onClick={(e) => handleDeletePlaylist(e, playlist.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </nav>

                {/* Expand indicator */}
                {!expanded && (
                    <div className="p-3 flex justify-center">
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                    </div>
                )}
            </aside>

            {/* Play History Modal */}
            {showHistory && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHistory(false)}>
                    <div className="bg-white rounded-xl p-6 w-[500px] max-h-[70vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">再生履歴</h2>
                            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                        </div>
                        <div className="overflow-y-auto flex-1 space-y-2">
                            {history.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">履歴がありません</p>
                            ) : (
                                history.map(item => (
                                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100">
                                        <div className="w-10 h-10 bg-gray-200 rounded overflow-hidden shrink-0">
                                            {item.cover_path && (
                                                <img src={`asset://localhost/${item.cover_path}`} alt="" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-gray-900 text-sm truncate">{item.track_title}</div>
                                            <div className="text-gray-500 text-xs truncate">{item.work_title}</div>
                                        </div>
                                        <div className="text-gray-400 text-xs shrink-0">
                                            {new Date(item.played_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
