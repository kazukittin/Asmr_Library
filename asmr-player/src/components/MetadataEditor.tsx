import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Work } from '../hooks/useLibrary';
import { X, Save, Download } from 'lucide-react';
import { AutocompleteInput, SuggestionItem } from './AutocompleteInput';
import { TagInput } from './TagInput';

interface MetadataEditorProps {
    work: Work;
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

interface ScrapedMetadata {
    title: string;
    circle: string | null;
    voice_actors: string[];
    tags: string[];
}

export function MetadataEditor({ work, isOpen, onClose, onSave }: MetadataEditorProps) {
    const [title, setTitle] = useState(work.title);
    const [circles, setCircles] = useState(work.circles || '');
    const [voiceActors, setVoiceActors] = useState(work.voice_actors || '');
    const [tags, setTags] = useState(work.tags || '');
    const [saving, setSaving] = useState(false);
    const [fetching, setFetching] = useState(false);

    // Suggestion data from backend
    const [allCircles, setAllCircles] = useState<SuggestionItem[]>([]);
    const [allVoiceActors, setAllVoiceActors] = useState<SuggestionItem[]>([]);
    const [allTags, setAllTags] = useState<SuggestionItem[]>([]);

    // Reset state when work changes or modal opens
    useEffect(() => {
        if (isOpen) {
            setTitle(work.title);
            setCircles(work.circles || '');
            setVoiceActors(work.voice_actors || '');
            setTags(work.tags || '');

            // Load suggestions
            loadSuggestions();
        }
    }, [work, isOpen]);

    const loadSuggestions = async () => {
        try {
            const [circlesData, voiceActorsData, tagsData] = await Promise.all([
                invoke<SuggestionItem[]>('get_all_circles'),
                invoke<SuggestionItem[]>('get_all_voice_actors'),
                invoke<SuggestionItem[]>('get_all_tags')
            ]);
            setAllCircles(circlesData);
            setAllVoiceActors(voiceActorsData);
            setAllTags(tagsData);
        } catch (e) {
            console.error("Failed to load suggestions:", e);
        }
    };

    const handleFetchFromDLsite = async () => {
        if (!work.rj_code) {
            alert('RJコードが設定されていません。');
            return;
        }

        setFetching(true);
        try {
            const metadata = await invoke<ScrapedMetadata>('scrape_work_metadata', { workId: work.id });

            // Auto-fill the fields
            if (metadata.title) setTitle(metadata.title);
            if (metadata.circle) setCircles(metadata.circle);
            if (metadata.voice_actors && metadata.voice_actors.length > 0) {
                setVoiceActors(metadata.voice_actors.join(', '));
            }
            if (metadata.tags && metadata.tags.length > 0) {
                setTags(metadata.tags.join(', '));
            }

            // Reload suggestions to include newly added items
            loadSuggestions();
        } catch (e) {
            console.error("Failed to fetch metadata:", e);
            alert(`取得エラー: ${e}`);
        } finally {
            setFetching(false);
        }
    };

    if (!isOpen) return null;

    const handleSave = async () => {
        setSaving(true);
        try {
            await invoke('update_work_metadata', {
                workId: work.id,
                title,
                circles,
                voiceActors,
                tags
            });
            onSave();
            onClose();
        } catch (e) {
            console.error("Failed to update metadata:", e);
            alert(`Error: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-bg-panel w-[500px] rounded-xl shadow-2xl border border-white/10 p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">作品情報の編集</h2>
                    {work.rj_code && (
                        <button
                            onClick={handleFetchFromDLsite}
                            disabled={fetching}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors border border-blue-500/30"
                        >
                            <Download size={14} />
                            {fetching ? '取得中...' : 'DLsiteから取得'}
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">タイトル</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-accent text-sm"
                        />
                    </div>

                    <AutocompleteInput
                        value={circles}
                        onChange={setCircles}
                        suggestions={allCircles}
                        label="サークル (カンマ区切り)"
                        placeholder="Circle A, Circle B"
                    />

                    <TagInput
                        value={voiceActors}
                        onChange={setVoiceActors}
                        suggestions={allVoiceActors}
                        label="声優"
                        placeholder="声優名を入力してEnter..."
                    />

                    <TagInput
                        value={tags}
                        onChange={setTags}
                        suggestions={allTags}
                        label="タグ"
                        placeholder="タグを入力してEnter..."
                    />
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                        disabled={saving}
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 rounded text-sm bg-accent text-white font-bold hover:bg-accent-hover transition-colors flex items-center gap-2 shadow-lg shadow-accent/20"
                    >
                        {saving ? '保存中...' : (
                            <>
                                <Save size={16} /> 保存
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
