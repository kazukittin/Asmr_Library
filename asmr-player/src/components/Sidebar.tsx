import { Library, Mic, Tag, Ear, Moon, FolderPlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

export function Sidebar() {
    const [scanCount, setScanCount] = useState(0);
    const [scanning, setScanning] = useState(false);

    useEffect(() => {
        const unlisten = listen('scan-progress', (event) => {
            setScanCount(event.payload as number);
            setScanning(true);
        });

        return () => {
            unlisten.then(f => f());
        }
    }, []);

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

    return (
        <aside className="w-64 bg-bg-sidebar flex flex-col border-r border-white/5 z-20 h-full">
            <div className="h-16 flex items-center px-6 border-b border-white/5 shrink-0 justify-between">
                <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-accent mr-3 shadow-[0_0_10px_#a855f7]"></div>
                    <span className="font-bold text-lg tracking-wide text-white">ASMR Player</span>
                </div>
            </div>

            <div className="p-3">
                <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="w-full flex items-center justify-center px-3 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/5"
                >
                    <FolderPlus className="w-4 h-4 mr-2" />
                    <span className="text-sm">{scanning ? 'スキャン中...' : 'ライブラリ更新'}</span>
                </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
                <div className="px-3 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">ライブラリ</div>

                <a href="#" className="flex items-center px-3 py-2 text-white bg-white/5 rounded-lg transition-colors group">
                    <Library className="w-5 h-5 mr-3 text-accent" />
                    最近追加された作品
                </a>
                <a href="#" className="flex items-center px-3 py-2 text-gray-400 hover:text-white hover:bg-bg-hover rounded-lg transition-colors">
                    <Mic className="w-5 h-5 mr-3 text-gray-500" />
                    声優 (CV)
                </a>
                <a href="#" className="flex items-center px-3 py-2 text-gray-400 hover:text-white hover:bg-bg-hover rounded-lg transition-colors">
                    <Tag className="w-5 h-5 mr-3 text-gray-500" />
                    タグ / ジャンル
                </a>

                <div className="mt-8 px-3 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">プレイリスト</div>
                <a href="#" className="flex items-center px-3 py-2 text-gray-400 hover:text-white hover:bg-bg-hover rounded-lg transition-colors">
                    <Ear className="w-5 h-5 mr-3 text-pink-500" />
                    耳かき (Binaural)
                </a>
                <a href="#" className="flex items-center px-3 py-2 text-gray-400 hover:text-white hover:bg-bg-hover rounded-lg transition-colors">
                    <Moon className="w-5 h-5 mr-3 text-blue-500" />
                    睡眠導入 (Sleep)
                </a>
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
