import { Play } from 'lucide-react';
import { useLibrary, Work } from '../hooks/useLibrary';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { convertFileSrc } from '@tauri-apps/api/core';

export function WorkGrid() {
    const { works, loading } = useLibrary();
    const { setTrack } = usePlayerStore();

    const handlePlay = async (work: Work) => {
        console.log("Play work:", work.title);
        // Mock play for now to satisfy linter and show functionality
        setTrack({
            id: 0,
            title: `Track 1 of ${work.title}`,
            path: "",
            duration: 0,
            work_title: work.title,
            cover_path: work.cover_path || undefined
        });
    };

    if (loading) return <div className="p-8 text-white">Loading...</div>;

    return (
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="flex items-end justify-between mb-6">
                <h2 className="text-2xl font-bold text-white tracking-tight">Recently Added</h2>
                <span className="text-sm text-gray-500">{works.length} Works</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 pb-20">
                {works.map((work) => (
                    <div key={work.id} className="group relative flex flex-col cursor-pointer">
                        <div className="aspect-[2/3] w-full rounded-xl overflow-hidden relative bg-bg-panel shadow-lg shadow-black/50 group-hover:shadow-accent/20 transition-all duration-300 transform group-hover:-translate-y-1 ring-1 ring-white/5 group-hover:ring-accent/50">
                            <img
                                src={work.cover_path ? convertFileSrc(work.cover_path) : `https://placehold.co/400x600/2a2a35/FFF?text=${work.rj_code || 'ASMR'}`}
                                alt={work.title}
                                className="w-full h-full object-cover transition duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                            />

                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                <button
                                    className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.6)] hover:scale-105 transition-transform"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlay(work);
                                    }}
                                >
                                    <Play className="w-5 h-5 ml-1" />
                                </button>
                            </div>

                            <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                                {work.rj_code && (
                                    <span className="bg-black/80 backdrop-blur-md text-[10px] font-bold text-pink-400 px-2 py-0.5 rounded border border-pink-500/30">
                                        DLsite
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="mt-3">
                            <h3 className="text-sm font-bold text-gray-200 truncate group-hover:text-accent transition-colors">
                                {work.title}
                            </h3>
                            <div className="flex justify-between items-center mt-1">
                                <p className="text-xs text-gray-400 truncate">Unknown CV</p>
                                {work.rj_code && (
                                    <span className="text-[10px] text-gray-600 font-mono bg-white/5 px-1 rounded">
                                        {work.rj_code}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
