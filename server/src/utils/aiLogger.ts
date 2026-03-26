import fs from 'fs-extra';
import path from 'path';
import { serverLogger } from './logger.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const AI_LOGS_DIR = path.join(DATA_DIR, 'logs');
const AI_LOG_FILE = path.join(AI_LOGS_DIR, 'ai_interactions.log');
const AI_LOG_JSON_DIR = path.join(AI_LOGS_DIR, 'ai_calls');

export interface AILogEntry {
  id: string;
  timestamp: string;
  model: string;
  provider: 'gemini' | 'openai' | 'ollama';
  requestInfo: {
    systemPrompt?: string;
    userInput: string;
    inputLength: number;
  };
  responseInfo: {
    rawOutput?: string;
    finishReason?: string;
    success: boolean;
  };
  metadata: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    estimatedCost?: number;
  };
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
  redactedData?: boolean;
}

interface MaskingConfig {
  maskEmails?: boolean;
  maskPhoneNumbers?: boolean;
  maskTransactionDetails?: boolean;
  customPatterns?: Array<{ pattern: RegExp; replacement: string }>;
}

const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  maskEmails: true,
  maskPhoneNumbers: true,
  maskTransactionDetails: true
};

/** In-flight AI API calls (Gemini generateContent, etc.) for live activity indicators */
let activeAIRequests = 0;

export function getActiveAIRequestCount(): number {
  return activeAIRequests;
}

/** Wrap an AI provider call so active request count stays accurate for the UI */
export async function runWithAILoadTracking<T>(fn: () => Promise<T>): Promise<T> {
  activeAIRequests++;
  try {
    return await fn();
  } finally {
    activeAIRequests--;
  }
}

/**
 * Mask sensitive data in text
 */
function maskSensitiveData(text: string, config: MaskingConfig = DEFAULT_MASKING_CONFIG): string {
  let masked = text;

  if (config.maskEmails) {
    masked = masked.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL_REDACTED]');
  }

  if (config.maskPhoneNumbers) {
    masked = masked.replace(/(?<!\d)\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}(?!\d)/g, (match) => {
      // Don't mask if it looks like a date (YYYY-MM-DD, DD/MM/YYYY, etc.)
      if (/^\d{2,4}[-./]\d{2}[-./]\d{2,4}/.test(match)) {
        return match;
      }
      // Ensure it's long enough to be a phone number (at least 8 digits)
      const digitCount = match.replace(/\D/g, '').length;
      if (digitCount < 8 || digitCount > 15) {
        return match;
      }
      return '[PHONE_REDACTED]';
    });
  }

  if (config.maskTransactionDetails) {
    // Mask account numbers, card numbers, etc.
    masked = masked.replace(/\b\d{10,19}\b/g, '[ACCOUNT_REDACTED]');
  }

  if (config.customPatterns) {
    config.customPatterns.forEach(({ pattern, replacement }) => {
      masked = masked.replace(pattern, replacement);
    });
  }

  return masked;
}

/**
 * Calculate estimated cost based on tokens (Gemini Flash pricing)
 * Adjust rates based on your provider
 */
function calculateEstimatedCost(promptTokens?: number, completionTokens?: number): number {
  if (!promptTokens || !completionTokens) return 0;

  // Gemini 2.0 Flash rates (per 1M tokens)
  const INPUT_RATE = 0.075 / 1_000_000;  // $0.075 per 1M input tokens
  const OUTPUT_RATE = 0.3 / 1_000_000;   // $0.3 per 1M output tokens

  return (promptTokens * INPUT_RATE) + (completionTokens * OUTPUT_RATE);
}

/**
 * Initialize logging directories
 */
async function ensureLogsDirectory(): Promise<void> {
  try {
    await fs.ensureDir(AI_LOGS_DIR);
    await fs.ensureDir(AI_LOG_JSON_DIR);
  } catch (error) {
    serverLogger.error('Failed to create AI logs directory:', { error });
  }
}

/**
 * Log an AI interaction
 */
export async function logAICall(entry: Omit<AILogEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    await ensureLogsDirectory();

    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date().toISOString();

    const logEntry: AILogEntry = {
      id,
      timestamp,
      ...entry
    };

    // Determine if data was redacted
    const originalInput = entry.requestInfo.userInput;
    const maskedInput = maskSensitiveData(originalInput);
    logEntry.redactedData = originalInput !== maskedInput;

    if (logEntry.redactedData) {
      logEntry.requestInfo.userInput = maskedInput;
      if (logEntry.requestInfo.systemPrompt) {
        logEntry.requestInfo.systemPrompt = maskSensitiveData(logEntry.requestInfo.systemPrompt);
      }
      if (logEntry.responseInfo.rawOutput) {
        logEntry.responseInfo.rawOutput = maskSensitiveData(logEntry.responseInfo.rawOutput);
      }
    }

    // Write individual JSON file for this call
    const jsonFileName = path.join(AI_LOG_JSON_DIR, `${id}.json`);
    await fs.writeJson(jsonFileName, logEntry, { spaces: 2 });

    // Append to log file (single line JSON for easy parsing)
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(AI_LOG_FILE, logLine, 'utf-8');

    serverLogger.debug(`AI call logged: ${id}`, {
      model: entry.model,
      provider: entry.provider,
      latencyMs: entry.metadata.latencyMs,
      totalTokens: entry.metadata.totalTokens
    });
  } catch (error) {
    serverLogger.error('Failed to log AI call:', { error });
  }
}

/**
 * Log an AI API error
 */
export async function logAIError(
  model: string,
  provider: 'gemini' | 'openai' | 'ollama',
  userInput: string,
  error: Error,
  metadata?: { latencyMs?: number; systemPrompt?: string }
): Promise<void> {
  try {
    await ensureLogsDirectory();

    const id = `error-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date().toISOString();

    // Extract error code
    const errorCode = (error as any).code || (error as any).status || 'UNKNOWN_ERROR';
    const errorMessage = error.message;

    const origUser = userInput;
    const maskedUser = maskSensitiveData(userInput);
    const userRedacted = origUser !== maskedUser;

    let systemPromptField: string | undefined;
    let systemRedacted = false;
    if (metadata?.systemPrompt) {
      const origSys = metadata.systemPrompt;
      const maskedSys = maskSensitiveData(origSys);
      systemRedacted = origSys !== maskedSys;
      systemPromptField = systemRedacted ? maskedSys : origSys;
    }

    const logEntry: AILogEntry = {
      id,
      timestamp,
      model,
      provider,
      requestInfo: {
        userInput: userRedacted ? maskedUser : origUser,
        inputLength: userInput.length,
        ...(systemPromptField !== undefined && { systemPrompt: systemPromptField })
      },
      responseInfo: {
        success: false
      },
      metadata: {
        latencyMs: metadata?.latencyMs || 0
      },
      error: {
        code: String(errorCode),
        message: errorMessage,
        timestamp
      },
      redactedData: userRedacted || systemRedacted
    };

    // Write individual JSON file for this error
    const jsonFileName = path.join(AI_LOG_JSON_DIR, `${id}.json`);
    await fs.writeJson(jsonFileName, logEntry, { spaces: 2 });

    // Append to log file
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(AI_LOG_FILE, logLine, 'utf-8');

    serverLogger.warn(`AI error logged: ${id}`, {
      model,
      provider,
      errorCode,
      errorMessage
    });
  } catch (err) {
    serverLogger.error('Failed to log AI error:', { error: err });
  }
}

/**
 * Find a single AI log entry by id (linear scan of the log file).
 */
export async function getAILogById(id: string): Promise<AILogEntry | null> {
  if (!id?.trim()) return null;
  try {
    await ensureLogsDirectory();
    const content = await fs.readFile(AI_LOG_FILE, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const log = JSON.parse(line) as AILogEntry;
        if (log?.id === id) return log;
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Retrieve all AI logs with optional filtering
 */
export async function getAILogs(options?: {
  limit?: number;
  offset?: number;
  model?: string;
  provider?: string;
  includeErrors?: boolean;
}): Promise<{ logs: AILogEntry[]; total: number }> {
  try {
    await ensureLogsDirectory();

    const lines = await fs.readFile(AI_LOG_FILE, 'utf-8');
    const allLogs: AILogEntry[] = lines
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((log): log is AILogEntry => log !== null)
      .reverse(); // Most recent first

    let filtered = allLogs;

    if (options?.model) {
      filtered = filtered.filter(log => log.model === options.model);
    }

    if (options?.provider) {
      filtered = filtered.filter(log => log.provider === options.provider);
    }

    if (options?.includeErrors === false) {
      filtered = filtered.filter(log => !log.error);
    }

    const total = filtered.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;

    return {
      logs: filtered.slice(offset, offset + limit),
      total
    };
  } catch (error) {
    serverLogger.error('Failed to retrieve AI logs:', { error });
    return { logs: [], total: 0 };
  }
}

/**
 * Get AI logs statistics
 */
export async function getAILogsStats(): Promise<{
  totalCalls: number;
  totalErrors: number;
  totalTokensUsed: number;
  estimatedTotalCost: number;
  averageLatencyMs: number;
  modelBreakdown: Record<string, { calls: number; tokens: number; cost: number }>;
}> {
  try {
    const { logs } = await getAILogs({ limit: 10000 });

    const stats = {
      totalCalls: logs.length,
      totalErrors: logs.filter(log => log.error).length,
      totalTokensUsed: 0,
      estimatedTotalCost: 0,
      averageLatencyMs: 0,
      modelBreakdown: {} as Record<string, { calls: number; tokens: number; cost: number }>
    };

    let totalLatency = 0;

    logs.forEach(log => {
      if (!log.error && log.metadata.totalTokens) {
        stats.totalTokensUsed += log.metadata.totalTokens;
      }

      if (!log.error && log.metadata.promptTokens && log.metadata.completionTokens) {
        const cost = calculateEstimatedCost(log.metadata.promptTokens, log.metadata.completionTokens);
        stats.estimatedTotalCost += cost;
      }

      totalLatency += log.metadata.latencyMs;

      // Model breakdown
      if (!stats.modelBreakdown[log.model]) {
        stats.modelBreakdown[log.model] = { calls: 0, tokens: 0, cost: 0 };
      }

      stats.modelBreakdown[log.model].calls++;

      if (log.metadata.totalTokens) {
        stats.modelBreakdown[log.model].tokens += log.metadata.totalTokens;
      }

      if (log.metadata.promptTokens && log.metadata.completionTokens) {
        stats.modelBreakdown[log.model].cost += calculateEstimatedCost(
          log.metadata.promptTokens,
          log.metadata.completionTokens
        );
      }
    });

    stats.averageLatencyMs = logs.length > 0 ? Math.round(totalLatency / logs.length) : 0;

    return stats;
  } catch (error) {
    serverLogger.error('Failed to get AI logs stats:', { error });
    return {
      totalCalls: 0,
      totalErrors: 0,
      totalTokensUsed: 0,
      estimatedTotalCost: 0,
      averageLatencyMs: 0,
      modelBreakdown: {}
    };
  }
}

/**
 * Clear old AI logs (retain last N days)
 */
export async function clearOldAILogs(daysToRetain: number = 30): Promise<void> {
  try {
    const { logs } = await getAILogs({ limit: 100000 });
    const cutoffTime = Date.now() - daysToRetain * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    for (const log of logs) {
      const logTime = new Date(log.timestamp).getTime();
      if (logTime < cutoffTime) {
        const jsonFileName = path.join(AI_LOG_JSON_DIR, `${log.id}.json`);
        await fs.remove(jsonFileName).catch(() => { });
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      serverLogger.info(`Cleared ${deletedCount} AI logs older than ${daysToRetain} days`);
    }
  } catch (error) {
    serverLogger.error('Failed to clear old AI logs:', { error });
  }
}

/**
 * Clear all AI logs (all entries and the main log file)
 */
export async function clearAllAILogs(): Promise<void> {
  try {
    await ensureLogsDirectory();
    const jsonFiles = await fs.readdir(AI_LOG_JSON_DIR).catch(() => []);
    let deletedCount = 0;
    for (const name of jsonFiles) {
      if (name.endsWith('.json')) {
        await fs.remove(path.join(AI_LOG_JSON_DIR, name)).catch(() => {});
        deletedCount++;
      }
    }
    if (await fs.pathExists(AI_LOG_FILE)) {
      await fs.writeFile(AI_LOG_FILE, '', 'utf-8');
    }
    serverLogger.info(`Cleared all AI logs (${deletedCount} entries)`);
  } catch (error) {
    serverLogger.error('Failed to clear all AI logs:', { error });
    throw error;
  }
}

/**
 * Wrapper function to automatically log AI calls with timing and error handling
 * @param callbackFn - Async function that makes the AI call
 * @param logConfig - Configuration for logging
 * @returns Result from the callback function
 */
export async function withAILogging<T>(
  callbackFn: () => Promise<{ output: T; promptTokens?: number; completionTokens?: number; finishReason?: string }>,
  logConfig: {
    model: string;
    provider: 'gemini' | 'openai' | 'ollama';
    userInput: string;
    systemPrompt?: string;
    shouldMask?: boolean;
  }
): Promise<T> {
  const startTime = Date.now();
  const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    const result = await runWithAILoadTracking(callbackFn);
    const latencyMs = Date.now() - startTime;

    const logEntry: Omit<AILogEntry, 'id' | 'timestamp'> = {
      model: logConfig.model,
      provider: logConfig.provider,
      requestInfo: {
        systemPrompt: logConfig.systemPrompt,
        userInput: logConfig.userInput,
        inputLength: logConfig.userInput.length
      },
      responseInfo: {
        rawOutput: String(result.output),
        finishReason: result.finishReason,
        success: true
      },
      metadata: {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: (result.promptTokens || 0) + (result.completionTokens || 0),
        latencyMs,
        estimatedCost: result.promptTokens && result.completionTokens
          ? calculateEstimatedCost(result.promptTokens, result.completionTokens)
          : undefined
      }
    };

    await logAICall(logEntry);
    return result.output;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any).code || (error as any).status || 'UNKNOWN_ERROR';

    await logAIError(logConfig.model, logConfig.provider, logConfig.userInput, error as Error, {
      latencyMs,
      systemPrompt: logConfig.systemPrompt
    });

    throw error;
  }
}

/**
 * Wrapper for batch AI calls
 */
export async function withAILoggingBatch<T>(
  transactions: T[],
  callbackFn: (item: T) => Promise<{ output: any; promptTokens?: number; completionTokens?: number; finishReason?: string }>,
  logConfig: {
    model: string;
    provider: 'gemini' | 'openai' | 'ollama';
    batchName: string;
    shouldMask?: boolean;
  }
): Promise<any[]> {
  const results = [];
  const batchStartTime = Date.now();

  for (const item of transactions) {
    try {
      const itemStartTime = Date.now();
      const result = await runWithAILoadTracking(() => callbackFn(item));
      const latencyMs = Date.now() - itemStartTime;

      const userInput = JSON.stringify(item);
      const logEntry: Omit<AILogEntry, 'id' | 'timestamp'> = {
        model: logConfig.model,
        provider: logConfig.provider,
        requestInfo: {
          userInput: logConfig.shouldMask ? maskSensitiveData(userInput) : userInput,
          inputLength: userInput.length
        },
        responseInfo: {
          rawOutput: String(result.output),
          finishReason: result.finishReason,
          success: true
        },
        metadata: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: (result.promptTokens || 0) + (result.completionTokens || 0),
          latencyMs,
          estimatedCost: result.promptTokens && result.completionTokens
            ? calculateEstimatedCost(result.promptTokens, result.completionTokens)
            : undefined
        }
      };

      await logAICall(logEntry);
      results.push(result.output);
    } catch (error) {
      serverLogger.error(`Error processing batch item in ${logConfig.batchName}:`, { error });
      results.push(null);
    }
  }

  return results;
}

export { calculateEstimatedCost };
