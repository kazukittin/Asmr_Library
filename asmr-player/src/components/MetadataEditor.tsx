import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Work } from '../hooks/useLibrary';
import { X, Save } from 'lucide-react';

interface MetadataEditorProps {
    work: Work;
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

export function MetadataEditor({ work, isOpen, onClose, onSave }: MetadataEditorProps) {
    const [title, setTitle] = useState(work.title);
    const [circles, setCircles] = useState(work.circles || '');
    const [voiceActors, setVoiceActors] = useState(work.voice_actors || '');
    const [tags, setTags] = useState(work.tags || '');
    const [saving, setSaving] = useState(false);

    // Reset state when work changes or modal opens
    useEffect(() => {
        if (isOpen) {
            setTitle(work.title);
            setCircles(work.circles || '');
            setVoiceActors(work.voice_actors || '');
            setTags(work.tags || '');
        }
    }, [work, isOpen]);

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

                <h2 className="text-xl font-bold text-white mb-6">作品情報の編集</h2>

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

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">サークル (カンマ区切り)</label>
                        <input
                            type="text"
                            value={circles}
                            onChange={(e) => setCircles(e.target.value)}
                            placeholder="Circle A, Circle B"
                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-accent text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">声優 (カンマ区切り)</label>
                        <input
                            type="text"
                            value={voiceActors}
                            onChange={(e) => setVoiceActors(e.target.value)}
                            placeholder="CV Name 1, CV Name 2"
                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-accent text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">タグ (カンマ区切り)</label>
                        <textarea
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            rows={3}
                            placeholder="ASMR, 耳かき, 囁き"
                            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-accent text-sm resize-none custom-scrollbar"
                        />
                    </div>
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
