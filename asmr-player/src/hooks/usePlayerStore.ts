import { create } from 'zustand';

interface Track {
    id: number;
    title: string;
    path: string;
    duration: number;
    work_title?: string;
    cover_path?: string;
}

interface PlayerState {
    isPlaying: boolean;
    currentTrack: Track | null;
    queue: Track[];
    volume: number;
    currentTime: number;
    duration: number;

    setIsPlaying: (isPlaying: boolean) => void;
    setTrack: (track: Track) => void;
    setQueue: (tracks: Track[]) => void;
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

    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setTrack: (track) => set({ currentTrack: track, isPlaying: true }),
    setQueue: (queue) => set({ queue }),

    playNext: () => {
        const { queue, currentTrack } = get();
        if (!currentTrack) return;
        const index = queue.findIndex(t => t.id === currentTrack.id);
        if (index < queue.length - 1) {
            set({ currentTrack: queue[index + 1], isPlaying: true });
        }
    },

    playPrev: () => {
        const { queue, currentTrack } = get();
        if (!currentTrack) return;
        const index = queue.findIndex(t => t.id === currentTrack.id);
        if (index > 0) {
            set({ currentTrack: queue[index - 1], isPlaying: true });
        }
    }
}));
