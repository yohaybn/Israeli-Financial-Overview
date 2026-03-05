import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ScrapeProgress {
    type: string;
    message: string;
    timestamp: string;
}

export interface ScrapeLog {
    message: string;
    timestamp: string;
}

export interface ScrapeComplete {
    success: boolean;
    transactionCount?: number;
    error?: string;
    executionTimeMs?: number;
}

const SOCKET_URL = 'http://localhost:3000';

export function useSocket() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [progress, setProgress] = useState<ScrapeProgress[]>([]);
    const [logs, setLogs] = useState<ScrapeLog[]>([]);
    const [completion, setCompletion] = useState<ScrapeComplete | null>(null);

    useEffect(() => {
        const socketInstance = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
        }) as any;

        socketInstance.on('connect', () => {
            console.log('[Socket] Connected:', socketInstance.id);
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            console.log('[Socket] Disconnected');
            setIsConnected(false);
        });

        socketInstance.on('scrape:progress', (data: ScrapeProgress) => {
            setProgress(prev => [...prev, data]);
        });

        socketInstance.on('scrape:log', (data: ScrapeLog) => {
            setLogs(prev => [...prev, data]);
        });

        socketInstance.on('scrape:complete', (data: ScrapeComplete) => {
            setCompletion(data);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    const clearProgress = useCallback(() => {
        setProgress([]);
        setLogs([]);
        setCompletion(null);
    }, []);

    return {
        socket,
        isConnected,
        progress,
        logs,
        completion,
        clearProgress,
    };
}
