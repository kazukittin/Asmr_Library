import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Tag, Disc3, Edit3, X } from 'lucide-react';
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
    const [selectedTags, setSelectedTags] = useState<TagWithCount[]>([]);
    const [works, setWorks] = useState<Work[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingWork, setEditingWork] = useState<Work | null>(null);

    useEffect(() => {
        loadTags();
    }, []);

    // Load works when selected tags change
    useEffect(() => {
        if (selectedTags.length > 0) {
            loadWorksByTags();
        } else {
            setWorks([]);
        }
    }, [selectedTags]);

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

    const loadWorksByTags = async () => {
        try {
            const tagIds = selectedTags.map(t => t.id);
            const data = await invoke<Work[]>('get_works_by_tags', { tagIds });
            setWorks(data);
        } catch (e) {
            console.error("Failed to load works:", e);
        }
    };

    const toggleTag = (tag: TagWithCount) => {
        setSelectedTags(prev => {
            const exists = prev.some(t => t.id === tag.id);
            if (exists) {
                return prev.filter(t => t.id !== tag.id);
            } else {
                return [...prev, tag];
            }
        });
    };

    const clearAllTags = () => {
        setSelectedTags([]);
    };

    const handleRefresh = () => {
        loadTags();
        if (selectedTags.length > 0) {
            loadWorksByTags();
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
        <div className="flex-1 flex flex-col overflow-hidden bg-bg-main">
            {/* Tags Header */}
            <div className="p-6 border-b border-card-border shrink-0 bg-bg-panel">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <Tag className="w-5 h-5 text-accent" />
                        タグ / ジャンル
                    </h2>
                    {selectedTags.length > 0 && (
                        <button
                            onClick={clearAllTags}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-text-primary bg-bg-hover hover:bg-gray-200 rounded transition-colors"
                        >
                            <X className="w-3 h-3" />
                            選択をクリア
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                        const isSelected = selectedTags.some(t => t.id === tag.id);
                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag)}
                                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${isSelected
                                    ? 'bg-accent text-white'
                                    : 'bg-tag-bg text-text-secondary hover:bg-gray-200'
                                    }`}
                            >
                                {tag.name}
                                <span className={`ml-1.5 ${isSelected ? 'text-white/70' : 'text-text-muted'}`}>
                                    ({tag.count})
                                </span>
                            </button>
                        );
                    })}

                    {tags.length === 0 && (
                        <p className="text-text-muted text-sm">
                            まだタグが登録されていません
                        </p>
                    )}
                </div>
            </div>

            {/* Works Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                {selectedTags.length > 0 ? (
                    <>
                        <h3 className="text-lg font-bold text-text-primary mb-4">
                            {selectedTags.map(t => `「${t.name}」`).join(' + ')} の作品 ({works.length})
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
                        {works.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                                <Tag className="w-12 h-12 mb-4 opacity-20" />
                                <p>選択したタグすべてを含む作品はありません</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted">
                        <Tag className="w-16 h-16 mb-4 opacity-20" />
                        <p>上のタグをクリックして作品を表示</p>
                        <p className="text-sm mt-2">複数選択で絞り込み可能</p>
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
        <div className="group relative bg-bg-panel rounded-lg overflow-hidden card-shadow hover:card-shadow-hover transition-all">
            <div
                className="aspect-square bg-gray-100 cursor-pointer relative"
                onClick={() => onSelect(work)}
            >
                {coverUrl ? (
                    <img src={coverUrl} alt={work.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted">
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
                <p className="text-sm text-text-primary font-medium truncate" title={work.title}>
                    {work.title}
                </p>
                {work.circles && (
                    <p className="text-xs text-text-muted truncate mt-1">{work.circles}</p>
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
