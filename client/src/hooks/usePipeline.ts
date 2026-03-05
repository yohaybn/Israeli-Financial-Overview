/**
 * Pipeline API Hook
 * Functions for pipeline management and execution
 */

import { useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import { api } from '../lib/api';

export interface PipelineStage {
  name: string;
  enabled: boolean;
  description: string;
}

export interface PipelineConfig {
  scrape: any;
  catalog: any;
  analyze: any;
  upload: any;
  notification: any;
  globalPersistResults?: boolean;
  notificationDetailLevel?: 'minimal' | 'normal' | 'detailed' | 'verbose';
}

export interface PipelineStageResult {
  stage: string;
  success: boolean;
  error?: string;
  durationMs: number;
  retryAttempt?: number;
}

export interface PipelineExecutionResult {
  pipelineId: string;
  executionStartTime: string;
  stages: PipelineStageResult[];
  summary: {
    successful: number;
    failed: number;
    totalDuration: number;
  };
}

export interface PipelineProgressEvent {
  message: string;
  timestamp: string;
  pipelineId?: string;
  duration?: number;
  stages?: PipelineStageResult[];
  summary?: any;
}

export function usePipeline() {
  const socket = useSocket();
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<PipelineProgressEvent[]>([]);

  // Subscribe to pipeline progress
  const subscribeToProgress = useCallback(() => {
    if (!socket || !socket.socket) return;

    socket.socket.on('pipeline:progress', (event: PipelineProgressEvent) => {
      setProgressEvents((prev) => [...prev, event]);
    });

    socket.socket.on('pipeline:complete', (event: PipelineProgressEvent) => {
      setProgressEvents((prev) => [...prev, event]);
      setIsExecuting(false);
    });

    return () => {
      if (socket && socket.socket) {
        socket.socket.off('pipeline:progress');
        socket.socket.off('pipeline:complete');
      }
    };
  }, [socket]);

  // Get pipeline config
  const getConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/pipeline/config');
      return response.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update pipeline config
  const updateConfig = useCallback(async (config: Partial<PipelineConfig>) => {
    setIsLoading(true);
    try {
      const response = await api.put('/pipeline/config', config);
      return response.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get available stages
  const getStages = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/pipeline/stages');
      return response.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Toggle specific stage
  const toggleStage = useCallback(async (stageName: string, enabled: boolean) => {
    setIsLoading(true);
    try {
      const response = await api.patch(`/pipeline/stages/${stageName}`, { enabled });
      return response.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Configure stage
  const configureStage = useCallback(
    async (stageName: string, stageConfig: any) => {
      setIsLoading(true);
      try {
        const response = await api.patch(`/pipeline/stages/${stageName}`, stageConfig);
        return response.data;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Execute pipeline
  const executePipeline = useCallback(
    async (scrapeRequest: any, configOverride?: Partial<PipelineConfig>) => {
      setIsLoading(true);
      setIsExecuting(true);
      setProgressEvents([]);

      try {
        const payload = {
          scrapeRequest,
          ...(configOverride && { configOverride }),
        };

        const response = await api.post('/pipeline/execute', payload);
        setCurrentPipelineId(response.data.pipelineId);
        return response.data as PipelineExecutionResult;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Execute pipeline with multiple profiles
  const executeMultipleProfiles = useCallback(
    async (scrapeRequests: any[], configOverride?: Partial<PipelineConfig>) => {
      setIsLoading(true);
      setIsExecuting(true);
      setProgressEvents([]);

      try {
        const payload = {
          scrapeRequests,
          ...(configOverride && { configOverride }),
        };

        const response = await api.post('/pipeline/execute-multiple', payload);
        setCurrentPipelineId(response.data.pipelineId);
        return response.data as PipelineExecutionResult;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Quick execute
  const executeQuick = useCallback(
    async (
      companyId: string,
      credentials: Record<string, string>,
      options?: any,
      enabledStages?: string[],
      notificationChannels?: string[]
    ) => {
      setIsLoading(true);
      setIsExecuting(true);
      setProgressEvents([]);

      try {
        const payload = {
          companyId,
          credentials,
          ...(options && { options }),
          ...(enabledStages && { enabledStages }),
          ...(notificationChannels && { notificationChannels }),
        };

        const response = await api.post('/pipeline/execute-quick', payload);
        setCurrentPipelineId(response.data.pipelineId);
        return response.data as PipelineExecutionResult;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Clear progress
  const clearProgress = useCallback(() => {
    setProgressEvents([]);
    setCurrentPipelineId(null);
  }, []);

  return {
    isLoading,
    isExecuting,
    currentPipelineId,
    progressEvents,
    getConfig,
    updateConfig,
    getStages,
    toggleStage,
    configureStage,
    executePipeline,
    executeMultipleProfiles,
    executeQuick,
    subscribeToProgress,
    clearProgress,
  };
}
