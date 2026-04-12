import fs from 'fs-extra';
import path from 'path';
import { serverLogger } from './logger.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const SCRAPE_RUN_LOG_DIR = path.join(DATA_DIR, 'logs', 'scrape_runs');

/** Filenames attached from HTTP save after post-scrape may finish; applied on write */
const pendingFilenames = new Map<string, string>();

export type ScrapeRunActionStatus =
  | 'ok'
  | 'skipped'
  | 'partial'
  | 'failed'
  | 'skipped_no_key'
  | 'queued';

export interface ScrapeRunActionRecord {
  key: string;
  status: ScrapeRunActionStatus;
  detail?: string;
  /** AI interaction log entry ids (from `data/logs/ai_interactions.log` / AI Logs UI) tied to this step. */
  aiLogIds?: string[];
}

export interface ScrapeRunLogEntry {
  id: string;
  timestamp: string;
  pipelineId: string;
  companyId?: string;
  profileName?: string;
  runSource?: 'telegram_bot' | 'scheduler' | 'manual';
  kind: 'single' | 'batch';
  transactionCount: number;
  scrapeSuccess: boolean;
  /** Result JSON filename under data/results (when known) */
  savedFilename?: string | null;
  /** Scheduler / batch: multiple saves */
  savedFilenames?: string[];
  actions: ScrapeRunActionRecord[];
  overallPostScrape: 'ok' | 'partial' | 'failed';
}

export function generateScrapeRunLogId(): string {
  return `scrape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Called when the HTTP layer saves `data/results/<filename>` for this run.
 * Sets a pending name for {@link writeScrapeRunLog} if it has not run yet; if the log file
 * already exists (post-scrape finished before save — common with async write), merges
 * `savedFilename` into the JSON on disk so the UI always gets a link.
 */
export function attachScrapeRunFilename(logId: string, filename: string): void {
  if (!logId || !filename) return;
  pendingFilenames.set(logId, filename);
  void mergeSavedFilenameIntoExistingLog(logId, filename);
}

async function mergeSavedFilenameIntoExistingLog(logId: string, filename: string): Promise<void> {
  try {
    await ensureDir();
    const file = path.join(SCRAPE_RUN_LOG_DIR, `${logId}.json`);
    if (!(await fs.pathExists(file))) return;
    const data = (await fs.readJson(file)) as ScrapeRunLogEntry;
    if (!data?.id || data.id !== logId) return;
    if (data.savedFilename === filename) return;
    data.savedFilename = filename;
    await fs.writeJson(file, data, { spaces: 2 });
    serverLogger.debug(`Scrape run log updated with savedFilename: ${logId}`, { filename });
  } catch (error) {
    serverLogger.warn('Failed to merge saved filename into scrape run log', { logId, error });
  }
}

function computeOverall(actions: ScrapeRunActionRecord[]): 'ok' | 'partial' | 'failed' {
  const critical = actions.find((a) => a.key === 'load-config' && a.status === 'failed');
  if (critical) return 'failed';
  const bad = actions.filter(
    (a) => a.status === 'failed' || (a.status === 'partial' && a.key === 'categorization')
  );
  if (bad.some((a) => a.status === 'failed')) return 'partial';
  if (bad.length > 0) return 'partial';
  return 'ok';
}

async function ensureDir(): Promise<void> {
  await fs.ensureDir(SCRAPE_RUN_LOG_DIR);
}

/**
 * Persist one scrape run (post-scrape pipeline + optional outbound steps).
 * Applies any pending filename from attachScrapeRunFilename(logId).
 */
export async function writeScrapeRunLog(
  entry: Omit<ScrapeRunLogEntry, 'id' | 'timestamp' | 'overallPostScrape'> & {
    id: string;
    overallPostScrape?: ScrapeRunLogEntry['overallPostScrape'];
  }
): Promise<void> {
  try {
    await ensureDir();
    let savedFilename = entry.savedFilename;
    const pending = pendingFilenames.get(entry.id);
    if (pending) {
      pendingFilenames.delete(entry.id);
      savedFilename = pending;
    }

    const overall = entry.overallPostScrape ?? computeOverall(entry.actions);

    const full: ScrapeRunLogEntry = {
      ...entry,
      savedFilename: savedFilename ?? entry.savedFilename ?? null,
      timestamp: new Date().toISOString(),
      overallPostScrape: overall,
    };

    const file = path.join(SCRAPE_RUN_LOG_DIR, `${entry.id}.json`);
    await fs.writeJson(file, full, { spaces: 2 });

    serverLogger.debug(`Scrape run logged: ${entry.id}`, {
      pipelineId: entry.pipelineId,
      transactionCount: entry.transactionCount,
      overallPostScrape: full.overallPostScrape,
    });
  } catch (error) {
    serverLogger.error('Failed to write scrape run log:', { error });
  }
}

export async function getScrapeRunLogs(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ logs: ScrapeRunLogEntry[]; total: number }> {
  try {
    await ensureDir();
    const files = await fs.readdir(SCRAPE_RUN_LOG_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const entries: ScrapeRunLogEntry[] = [];

    for (const f of jsonFiles) {
      try {
        const data = await fs.readJson(path.join(SCRAPE_RUN_LOG_DIR, f));
        if (data?.id && data?.timestamp) {
          entries.push(data as ScrapeRunLogEntry);
        }
      } catch {
        /* skip corrupt */
      }
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = entries.length;
    const offset = options?.offset || 0;
    const limit = Math.min(options?.limit || 100, 1000);

    return {
      logs: entries.slice(offset, offset + limit),
      total,
    };
  } catch (error) {
    serverLogger.error('Failed to read scrape run logs:', { error });
    return { logs: [], total: 0 };
  }
}

export async function getScrapeRunLogById(id: string): Promise<ScrapeRunLogEntry | null> {
  if (!id?.trim()) return null;
  try {
    await ensureDir();
    const file = path.join(SCRAPE_RUN_LOG_DIR, `${id}.json`);
    if (!(await fs.pathExists(file))) return null;
    const data = await fs.readJson(file);
    return data?.id ? (data as ScrapeRunLogEntry) : null;
  } catch {
    return null;
  }
}

export async function clearOldScrapeRunLogs(daysToRetain: number): Promise<void> {
  await ensureDir();
  const cutoff = Date.now() - daysToRetain * 24 * 60 * 60 * 1000;
  const files = await fs.readdir(SCRAPE_RUN_LOG_DIR);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(SCRAPE_RUN_LOG_DIR, f);
    try {
      const stat = await fs.stat(p);
      if (stat.mtimeMs < cutoff) {
        await fs.remove(p);
      }
    } catch {
      /* ignore */
    }
  }
}

export async function clearAllScrapeRunLogs(): Promise<void> {
  await ensureDir();
  const files = await fs.readdir(SCRAPE_RUN_LOG_DIR);
  for (const f of files) {
    if (f.endsWith('.json')) {
      await fs.remove(path.join(SCRAPE_RUN_LOG_DIR, f)).catch(() => {});
    }
  }
}
