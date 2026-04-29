import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TransactionReviewItem } from '@app/shared';
import { api } from '../lib/api';
import { getSocketIoPath, isIngressRelativeBase } from '../utils/publicBase';
import { isDemoMode } from '../demo/isDemo';

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

export interface CategorizationFailedEvent {
    error: string;
}

export interface TransactionReviewNeededEvent {
    count: number;
    items: TransactionReviewItem[];
}

export function useSocket() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [progress, setProgress] = useState<ScrapeProgress[]>([]);
    const [logs, setLogs] = useState<ScrapeLog[]>([]);
    const [completion, setCompletion] = useState<ScrapeComplete | null>(null);
    const [categorizationFailure, setCategorizationFailure] = useState<CategorizationFailedEvent | null>(null);
    const [transactionReviewAlert, setTransactionReviewAlert] = useState<TransactionReviewNeededEvent | null>(null);

    useEffect(() => {
        if (isDemoMode()) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get<{ success: boolean; data: { updatedAt: string; items: TransactionReviewItem[] } | null }>(
                    '/post-scrape/review-alert'
                );
                if (cancelled || !data?.data?.items?.length) return;
                setTransactionReviewAlert({ count: data.data.items.length, items: data.data.items });
            } catch {
                /* offline or first load */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (isDemoMode()) return;
        // Ingress: try polling first — Supervisor’s WS proxy can throw aiohttp errors; Engine.IO works over HTTP long-poll.
        const transports =
            import.meta.env.DEV || !isIngressRelativeBase()
                ? (['websocket', 'polling'] as const)
                : (['polling', 'websocket'] as const);
        const socketInstance = io('', {
            path: getSocketIoPath(),
            transports: [...transports],
        }) as any;

        socketInstance.on('connect', () => {
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
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

        socketInstance.on('categorization:failed', (data: CategorizationFailedEvent) => {
            setCategorizationFailure(data);
        });

        socketInstance.on('transactions:review-needed', (data: TransactionReviewNeededEvent) => {
            if (data?.items?.length) {
                setTransactionReviewAlert({ count: data.count ?? data.items.length, items: data.items });
            }
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

    const clearCategorizationFailure = useCallback(() => {
        setCategorizationFailure(null);
    }, []);

    const clearTransactionReviewAlert = useCallback(() => {
        setTransactionReviewAlert(null);
        if (!isDemoMode()) {
            void api.delete('/post-scrape/review-alert').catch(() => {});
        }
    }, []);

    return {
        socket,
        isConnected,
        progress,
        logs,
        completion,
        categorizationFailure,
        clearCategorizationFailure,
        transactionReviewAlert,
        clearTransactionReviewAlert,
        clearProgress,
    };
}
