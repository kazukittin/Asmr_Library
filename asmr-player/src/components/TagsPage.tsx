import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Tag, Disc3, Edit3 } from 'lucide-react';
import { Work } from '../hooks/useLibrary';
import { MetadataEditor } from './MetadataEditor';

interface TagWithCount {
    id: number;
    name: string;
    count: number;
}

interface TagsPageProps {
    onSelectWork: (work: Work) => void;
}

export function TagsPage({ onSelectWork }: TagsPageProps) {
    const [tags, setTags] = useState<TagWithCount[]>([]);
    const [selectedTag, setSelectedTag] = useState<TagWithCount | null>(null);
    const [works, setWorks] = useState<Work[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingWork, setEditingWork] = useState<Work | null>(null);

    useEffect(() => {
        loadTags();
    }, []);

    const loadTags = async () => {
        try {
            const data = await invoke<TagWithCount[]>('get_tags_with_count');
            setTags(data);
            setLoading(false);
        } catch (e) {
            console.error("Failed to load tags:", e);
            setLoading(false);
        }
    };

    const selectTag = async (tag: TagWithCount) => {
        setSelectedTag(tag);
        try {
            const data = await invoke<Work[]>('get_works_by_tag', { tagId: tag.id });
            setWorks(data);
        } catch (e) {
            console.error("Failed to load works:", e);
        }
    };

    const handleRefresh = () => {
        loadTags();
        if (selectedTag) {
            selectTag(selectedTag);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Disc3 className="w-8 h-8 text-accent animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tags Header */}
            <div className="p-6 border-b border-white/5 shrink-0">
                <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                    <Tag className="w-5 h-5 text-accent" />
                    タグ / ジャンル
                </h2>

                <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                        <button
                            key={tag.id}
                            onClick={() => selectTag(tag)}
                            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${selectedTag?.id === tag.id
                                    ? 'bg-accent text-white'
                                    : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                }`}
                        >
                            {tag.name}
                            <span className={`ml-1.5 ${selectedTag?.id === tag.id ? 'text-white/70' : 'text-gray-500'
                                }`}>
                                ({tag.count})
                            </span>
                        </button>
                    ))}

                    {tags.length === 0 && (
                        <p className="text-gray-500 text-sm">
                            まだタグが登録されていません
                        </p>
                    )}
                </div>
            </div>

            {/* Works Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {selectedTag ? (
                    <>
                        <h3 className="text-lg font-bold text-white mb-4">
                            「{selectedTag.name}」の作品 ({works.length})
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {works.map((work) => (
                                <WorkCard
                                    key={work.id}
                                    work={work}
                                    onSelect={onSelectWork}
                                    onEdit={() => setEditingWork(work)}
                                />
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Tag className="w-16 h-16 mb-4 opacity-20" />
                        <p>上のタグをクリックして作品を表示</p>
                    </div>
                )}
            </div>

            {editingWork && (
                <MetadataEditor
                    work={editingWork}
                    isOpen={true}
                    onClose={() => setEditingWork(null)}
                    onSave={handleRefresh}
                />
            )}
        </div>
    );
}

function WorkCard({ work, onSelect, onEdit }: { work: Work; onSelect: (work: Work) => void; onEdit: () => void }) {
    const coverUrl = work.cover_path ? convertFileSrc(work.cover_path) : null;

    return (
        <div className="group relative bg-bg-panel rounded-lg overflow-hidden border border-white/5 hover:border-accent/50 transition-all">
            <div
                className="aspect-square bg-gray-800 cursor-pointer relative"
                onClick={() => onSelect(work)}
            >
                {coverUrl ? (
                    <img src={coverUrl} alt={work.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <Disc3 className="w-12 h-12" />
                    </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                        <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            </div>
            <div className="p-3">
                <p className="text-sm text-white font-medium truncate" title={work.title}>
                    {work.title}
                </p>
                {work.circles && (
                    <p className="text-xs text-gray-500 truncate mt-1">{work.circles}</p>
                )}
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="absolute top-2 right-2 p-1.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
            >
                <Edit3 size={14} />
            </button>
        </div>
    );
}
