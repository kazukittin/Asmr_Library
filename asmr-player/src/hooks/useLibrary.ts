import { useState, useEffect } from 'react';
import Database from '@tauri-apps/plugin-sql';
import { listen } from '@tauri-apps/api/event';

export interface Work {
    id: number;
    rj_code: string | null;
    title: string;
    dir_path: string;
    cover_path: string | null;
}

export function useLibrary() {
    const [works, setWorks] = useState<Work[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLibrary = async () => {
        try {
            const db = await Database.load('sqlite:library.db');
            const result = await db.select<Work[]>('SELECT * FROM works ORDER BY created_at DESC');
            setWorks(result);
            setLoading(false);
        } catch (error) {
            console.error("Failed to load library:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLibrary();

        // Refresh when scan progresses (optional: debounced?)
        // Or just listen for specific finish event. 
        // For now we just fetch on mount.
        const unlisten = listen('scan-progress', () => {
            // Maybe don't refresh on every single file, but for now it's MVP
            // fetchLibrary(); 
        });

        return () => {
            unlisten.then(f => f());
        }
    }, []);

    return { works, loading, refetch: fetchLibrary };
}
