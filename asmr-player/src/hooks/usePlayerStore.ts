import { create } from 'zustand';

interface Track {
    id: number;
    title: string;
    path: string;
    duration: number;
    work_title?: string;
    cover_path?: string;
    work_id?: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
    isPlaying: boolean;
    currentTrack: Track | null;
    queue: Track[];
    volume: number;
    currentTime: number;
    duration: number;
    shuffle: boolean;
    repeatMode: RepeatMode;

    setIsPlaying: (isPlaying: boolean) => void;
    setTrack: (track: Track) => void;
    setQueue: (tracks: Track[]) => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    toggleShuffle: () => void;
    cycleRepeatMode: () => void;
    playNext: () => void;
    playPrev: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    isPlaying: false,
    currentTrack: null,
    queue: [],
    volume: 1.0,
    currentTime: 0,
    duration: 0,
    shuffle: false,
    repeatMode: 'off',

    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setTrack: (track) => set({ currentTrack: track, isPlaying: true }),
    setQueue: (queue) => set({ queue }),
    setCurrentTime: (currentTime) => set({ currentTime }),
    setDuration: (duration) => set({ duration }),

    toggleShuffle: () => set(state => ({ shuffle: !state.shuffle })),

    cycleRepeatMode: () => set(state => {
        const modes: RepeatMode[] = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(state.repeatMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        return { repeatMode: modes[nextIndex] };
    }),

    playNext: () => {
        const { queue, currentTrack, shuffle, repeatMode } = get();
        if (!currentTrack || queue.length === 0) return;

        const currentIndex = queue.findIndex(t => t.id === currentTrack.id);

        if (repeatMode === 'one') {
            // Repeat current track
            set({ currentTrack: { ...currentTrack }, isPlaying: true });
            return;
        }

        let nextIndex: number;
        if (shuffle) {
            // Random track (excluding current)
            const otherIndices = queue.map((_, i) => i).filter(i => i !== currentIndex);
            if (otherIndices.length === 0) return;
            nextIndex = otherIndices[Math.floor(Math.random() * otherIndices.length)];
        } else {
            nextIndex = currentIndex + 1;
        }

        if (nextIndex >= queue.length) {
            if (repeatMode === 'all') {
                nextIndex = 0;
            } else {
                return; // End of queue
            }
        }

        set({ currentTrack: queue[nextIndex], isPlaying: true });
    },

    playPrev: () => {
        const { queue, currentTrack, currentTime } = get();
        if (!currentTrack) return;

        // If more than 3 seconds in, restart current track
        if (currentTime > 3) {
            set({ currentTrack: { ...currentTrack }, isPlaying: true });
            return;
        }

        const index = queue.findIndex(t => t.id === currentTrack.id);
        if (index > 0) {
            set({ currentTrack: queue[index - 1], isPlaying: true });
        }
    }
}));

