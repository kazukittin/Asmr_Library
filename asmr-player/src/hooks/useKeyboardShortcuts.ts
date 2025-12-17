import { useEffect } from 'react';
import { usePlayerStore } from './usePlayerStore';
import { invoke } from '@tauri-apps/api/core';

export function useKeyboardShortcuts() {
    const {
        isPlaying, setIsPlaying, currentTrack, playNext, playPrev,
        toggleShuffle, cycleRepeatMode
    } = usePlayerStore();

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in an input
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (currentTrack) {
                        if (isPlaying) {
                            try { await invoke('pause_track'); } catch { }
                        } else {
                            try { await invoke('resume_track'); } catch { }
                        }
                        setIsPlaying(!isPlaying);
                    }
                    break;

                case 'ArrowRight':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        playNext();
                    } else if (currentTrack) {
                        e.preventDefault();
                        // Seek forward 10 seconds
                        try { await invoke('seek_track', { seconds: 10 }); } catch { }
                    }
                    break;

                case 'ArrowLeft':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        playPrev();
                    } else if (currentTrack) {
                        e.preventDefault();
                        // Seek backward 10 seconds
                        try { await invoke('seek_track', { seconds: -10 }); } catch { }
                    }
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    // Volume up
                    try {
                        const current = await invoke<number>('get_volume') || 1.0;
                        await invoke('set_volume', { volume: Math.min(1.0, current + 0.1) });
                    } catch { }
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    // Volume down
                    try {
                        const current = await invoke<number>('get_volume') || 1.0;
                        await invoke('set_volume', { volume: Math.max(0, current - 0.1) });
                    } catch { }
                    break;

                case 'KeyS':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        toggleShuffle();
                    }
                    break;

                case 'KeyR':
                    if (!e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        cycleRepeatMode();
                    }
                    break;

                case 'KeyM':
                    e.preventDefault();
                    // Mute toggle (set volume to 0 or restore)
                    try {
                        const current = await invoke<number>('get_volume') || 1.0;
                        if (current > 0) {
                            await invoke('set_volume', { volume: 0 });
                        } else {
                            await invoke('set_volume', { volume: 1.0 });
                        }
                    } catch { }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, currentTrack, setIsPlaying, playNext, playPrev, toggleShuffle, cycleRepeatMode]);
}
