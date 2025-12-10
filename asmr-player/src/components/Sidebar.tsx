import { Library, Mic, Tag, Ear, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

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

    return (
        <aside className="w-64 bg-bg-sidebar flex flex-col border-r border-white/5 z-20 h-full">
            <div className="h-16 flex items-center px-6 border-b border-white/5 shrink-0">
                <div className="w-3 h-3 rounded-full bg-accent mr-3 shadow-[0_0_10px_#a855f7]"></div>
                <span className="font-bold text-lg tracking-wide text-white">ASMR Player</span>
            </div>

            <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
                <div className="px-3 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">Library</div>

                <a href="#" className="flex items-center px-3 py-2 text-white bg-white/5 rounded-lg transition-colors group">
                    <Library className="w-5 h-5 mr-3 text-accent" />
                    全作品一覧
                </a>
                <a href="#" className="flex items-center px-3 py-2 text-gray-400 hover:text-white hover:bg-bg-hover rounded-lg transition-colors">
                    <Mic className="w-5 h-5 mr-3 text-gray-500" />
                    声優 (CV)
                </a>
                <a href="#" className="flex items-center px-3 py-2 text-gray-400 hover:text-white hover:bg-bg-hover rounded-lg transition-colors">
                    <Tag className="w-5 h-5 mr-3 text-gray-500" />
                    タグ / ジャンル
                </a>

                <div className="mt-8 px-3 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">Playlists</div>
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
                    <span>Scan Status</span>
                    <span className={`text-green-500 ${scanning ? 'animate-pulse' : ''}`}>{scanning ? `Scanning... (${scanCount})` : 'Idle'}</span>
                </div>
                <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-accent w-2/3 rounded-full"></div>
                </div>
            </div>
        </aside>
    );
}
