/**
 * Notification Module Types
 * Defines interfaces and enums for the notification system
 */

export type NotificationStatus = 'success' | 'failure' | 'warning';
export type NotificationDetailLevel = 'minimal' | 'normal' | 'detailed' | 'verbose';

export interface NotificationPayload {
  pipelineId: string;
  status: NotificationStatus;
  timestamp: Date;
  detailLevel: NotificationDetailLevel;
  summary: {
    durationMs: number;
    stagesRun: string[];
    successfulStages: string[];
    failedStage?: string;
    transactionCount?: number;
    insights?: string[];
    accounts?: number;
    balance?: number;
  };
  errorDetails?: {
    stage: string;
    message: string;
    stack?: string;
    retryAttempt?: number;
    maxRetries?: number;
  };
  intermediate?: {
    scrapeResult?: any;
    catalogedData?: any;
    analysisResults?: any;
    uploadStatus?: any;
  };
}

export interface NotifierConfig {
  enabled: boolean;
  [key: string]: any; // Channel-specific configuration
}

export interface NotificationChannelConfig {
  console?: NotifierConfig;
  email?: NotifierConfig & {
    recipient?: string;
    subject?: string;
  };
  telegram?: NotifierConfig & {
    chatId?: string;
    botToken?: string;
  };
  [key: string]: NotifierConfig | undefined;
}

export interface NotificationServiceConfig {
  defaultDetailLevel: NotificationDetailLevel;
  channels: NotificationChannelConfig;
  retryPolicy?: {
    maxRetries: number;
    delayMs: number;
    backoffMultiplier: number;
  };
}

export interface NotifierResult {
  channelName: string;
  success: boolean;
  error?: string;
  sentAt: Date;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationServiceConfig = {
  defaultDetailLevel: 'normal',
  channels: {
    console: {
      enabled: true,
    },
  },
  retryPolicy: {
    maxRetries: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
  },
};
