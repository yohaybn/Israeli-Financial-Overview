/**
 * Shared formatting for notification channels: Telegram (MarkdownV2), MQTT (JSON), console (plain text).
 */

import type { NotificationPayload } from './types.js';

// MarkdownV2 escape helper – must escape these chars outside code spans
export function escMDV2(text: string): string {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/** Remove MarkdownV2 escaping so continuation chunks can be sent as plain text */
export function unescapeMDV2(text: string): string {
  return String(text).replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1');
}

/**
 * AI replies often use Markdown `**bold**`. Telegram MarkdownV2 uses `*bold*` (single asterisks).
 */
function markdownBoldToMarkdownV2(text: string): string {
  const s = String(text);
  const re = /\*\*([\s\S]*?)\*\*/g;
  let last = 0;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out += escMDV2(s.slice(last, m.index));
    out += `*${escMDV2(m[1])}*`;
    last = m.index + m[0].length;
  }
  out += escMDV2(s.slice(last));
  return out;
}

const LABELS: Record<'en' | 'he', Record<string, string>> = {
  en: {
    scrapeNotification: '🏦 Scrape Notification',
    profile: 'Profile',
    duration: 'Duration',
    transactions: 'Transactions',
    accounts: 'Accounts',
    balance: 'Balance',
    error: 'Error',
    stages: 'Stages',
    successful: 'Successful',
    failed: 'Failed',
    timestamp: 'Timestamp',
    insights: 'Insights',
    reviewCountTitle: 'Category / memo',
    fraudSegmentTitle: 'Suspicious / anomaly',
    customAiSegmentTitle: 'Custom query',
    source: 'Source',
    sourceTelegramBot: 'Telegram bot',
    sourceScheduler: 'Scheduler',
    sourceManual: 'Manual',
    successStatus: '✅ SUCCESS',
    failureStatus: '❌ FAILURE',
    warningStatus: '⚠️ WARNING',
    seconds: 's',
  },
  he: {
    scrapeNotification: '🏦 תוצאת סריקה',
    profile: 'פרופיל',
    duration: 'משך',
    transactions: 'עסקאות',
    accounts: 'חשבונות',
    balance: 'יתרה',
    error: 'שגיאה',
    stages: 'שלבים',
    successful: 'הצליחו',
    failed: 'נכשל',
    timestamp: 'זמן',
    insights: 'תובנות',
    reviewCountTitle: 'קטגוריה / הערה',
    fraudSegmentTitle: 'חשוד / חריגה',
    customAiSegmentTitle: 'שאילתת AI מותאמת',
    source: '\u05DE\u05E7\u05D5\u05E8',
    sourceTelegramBot: '\u05D1\u05D5\u05D8 \u05D8\u05DC\u05D2\u05E8\u05DD',
    sourceScheduler: '\u05DE\u05EA\u05D6\u05DE\u05DF',
    sourceManual: '\u05D9\u05D3\u05E0\u05D9',
    successStatus: '✅ הצלחה',
    failureStatus: '❌ כישלון',
    warningStatus: '⚠️ אזהרה',
    seconds: 'שניות',
  },
};

function L(language: 'en' | 'he', key: string): string {
  return LABELS[language]?.[key] ?? LABELS['en'][key] ?? key;
}

function statusText(language: 'en' | 'he', status: string): string {
  if (status === 'success') return L(language, 'successStatus');
  if (status === 'failure') return L(language, 'failureStatus');
  return L(language, 'warningStatus');
}

function runSourceText(language: 'en' | 'he', source?: string): string {
  if (source === 'telegram_bot') return L(language, 'sourceTelegramBot');
  if (source === 'scheduler') return L(language, 'sourceScheduler');
  return L(language, 'sourceManual');
}

/**
 * Format pipeline notification as Telegram MarkdownV2 (same rules as legacy TelegramNotifier).
 */
export function toMarkdown(payload: NotificationPayload, language: 'en' | 'he' = 'en'): string {
  if (payload.telegramSegment === 'review-count') {
    const line = (payload.summary.insights && payload.summary.insights[0]) || '';
    return `*${escMDV2(L(language, 'reviewCountTitle'))}*\n${escMDV2(line)}`;
  }
  if (payload.telegramSegment === 'fraud') {
    const body = (payload.summary.insights || []).join('\n\n');
    return `*${escMDV2(L(language, 'fraudSegmentTitle'))}*\n\n${escMDV2(body)}`;
  }
  if (payload.telegramSegment === 'custom-ai') {
    const body = (payload.summary.insights || []).join('\n\n');
    return `*${escMDV2(L(language, 'customAiSegmentTitle'))}*\n\n${markdownBoldToMarkdownV2(body)}`;
  }

  const statusLine = `${statusText(language, payload.status)}`;
  const title = `*${escMDV2(L(language, 'scrapeNotification'))} \\- ${escMDV2(statusLine)}*`;
  const durationStr = `${(payload.summary.durationMs / 1000).toFixed(2)}${L(language, 'seconds')}`;
  const sourceStr = runSourceText(language, payload.runSource);

  switch (payload.detailLevel) {
    case 'minimal':
      return `${title}\n*${escMDV2(L(language, 'source'))}:* ${escMDV2(sourceStr)}\n⏱ ${escMDV2(durationStr)}`;

    case 'normal': {
      const lines: string[] = [title];
      lines.push(`*${escMDV2(L(language, 'profile'))}:* \`${escMDV2(payload.pipelineId)}\``);
      lines.push(`*${escMDV2(L(language, 'source'))}:* ${escMDV2(sourceStr)}`);
      lines.push(`*${escMDV2(L(language, 'duration'))}:* ${escMDV2(durationStr)}`);
      if (payload.summary.transactionCount != null) {
        lines.push(`*${escMDV2(L(language, 'transactions'))}:* ${escMDV2(String(payload.summary.transactionCount))}`);
      }
      if (payload.summary.failedStage) {
        lines.push(`*${escMDV2(L(language, 'failed'))}:* ${escMDV2(payload.summary.failedStage)}`);
      }
      if (payload.summary.insights?.length) {
        lines.push(`*${escMDV2(L(language, 'insights'))}:*`);
        payload.summary.insights.forEach(i => lines.push(`• ${escMDV2(i)}`));
      }
      if (payload.errorDetails?.message) {
        lines.push(`*${escMDV2(L(language, 'error'))}:* ${escMDV2(payload.errorDetails.message)}`);
      }
      return lines.join('\n');
    }

    case 'detailed': {
      const lines: string[] = [title];
      lines.push(`*${escMDV2(L(language, 'profile'))}:* \`${escMDV2(payload.pipelineId)}\``);
      lines.push(`*${escMDV2(L(language, 'source'))}:* ${escMDV2(sourceStr)}`);
      lines.push(`*${escMDV2(L(language, 'timestamp'))}:* ${escMDV2(payload.timestamp.toISOString())}`);
      lines.push(`*${escMDV2(L(language, 'duration'))}:* ${escMDV2(durationStr)}`);
      if (payload.summary.stagesRun.length) {
        lines.push(`*${escMDV2(L(language, 'stages'))}:* ${escMDV2(payload.summary.stagesRun.join(' → '))}`);
      }
      if (payload.summary.successfulStages.length) {
        lines.push(`*${escMDV2(L(language, 'successful'))}:* ${escMDV2(payload.summary.successfulStages.join(', '))}`);
      }
      if (payload.summary.failedStage) {
        lines.push(`*${escMDV2(L(language, 'failed'))}:* ${escMDV2(payload.summary.failedStage)}`);
      }
      if (payload.summary.transactionCount != null) {
        lines.push(`*${escMDV2(L(language, 'transactions'))}:* ${escMDV2(String(payload.summary.transactionCount))}`);
      }
      if (payload.summary.accounts != null) {
        lines.push(`*${escMDV2(L(language, 'accounts'))}:* ${escMDV2(String(payload.summary.accounts))}`);
      }
      if (payload.summary.insights?.length) {
        lines.push(`*${escMDV2(L(language, 'insights'))}:*`);
        payload.summary.insights.forEach(i => lines.push(`• ${escMDV2(i)}`));
      }
      if (payload.errorDetails?.message) {
        lines.push(`*${escMDV2(L(language, 'error'))}:* ${escMDV2(payload.errorDetails.message)}`);
      }
      return lines.join('\n');
    }

    case 'verbose':
      return `\`\`\`\n${JSON.stringify(payload, jsonReplacer, 2).substring(0, 3900)}\n\`\`\``;

    default:
      return toMarkdown({ ...payload, detailLevel: 'normal' }, language);
  }
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Stable JSON for MQTT: ISO dates, safe serialization (drops problematic intermediate if needed).
 */
export function toJson(payload: NotificationPayload): string {
  try {
    return JSON.stringify(payload, jsonReplacer);
  } catch {
    const slim: Record<string, unknown> = {
      pipelineId: payload.pipelineId,
      status: payload.status,
      timestamp: payload.timestamp instanceof Date ? payload.timestamp.toISOString() : String(payload.timestamp),
      detailLevel: payload.detailLevel,
      runSource: payload.runSource,
      telegramSegment: payload.telegramSegment,
      summary: payload.summary,
      errorDetails: payload.errorDetails,
    };
    return JSON.stringify(slim);
  }
}

/**
 * Plain multi-line text for console / logs (legacy BaseNotifier behavior).
 */
export function toPlainText(payload: NotificationPayload): string {
  switch (payload.detailLevel) {
    case 'minimal':
      return `[${payload.status.toUpperCase()}] Pipeline ${payload.pipelineId} completed in ${payload.summary.durationMs}ms`;

    case 'normal':
      return [
        `Pipeline Notification - ${payload.status.toUpperCase()}`,
        `ID: ${payload.pipelineId}`,
        `Duration: ${payload.summary.durationMs}ms`,
        `Stages: ${payload.summary.stagesRun.join(' -> ')}`,
        `Successful: ${payload.summary.successfulStages.join(', ')}`,
        payload.summary.failedStage ? `Failed: ${payload.summary.failedStage}` : '',
        payload.summary.transactionCount ? `Transactions: ${payload.summary.transactionCount}` : '',
        payload.summary.insights?.length ? `Insights: ${payload.summary.insights.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

    case 'detailed':
      return [
        `Pipeline Notification - ${payload.status.toUpperCase()}`,
        `ID: ${payload.pipelineId}`,
        `Timestamp: ${payload.timestamp.toISOString()}`,
        `Duration: ${payload.summary.durationMs}ms`,
        `Stages Run: ${payload.summary.stagesRun.join(' -> ')}`,
        `Successful Stages: ${payload.summary.successfulStages.join(', ')}`,
        payload.summary.failedStage ? `Failed Stage: ${payload.summary.failedStage}` : '',
        `Summary:`,
        `  Transactions: ${payload.summary.transactionCount || 0}`,
        `  Accounts: ${payload.summary.accounts || 0}`,
        `  Balance: ${payload.summary.balance || 0}`,
        payload.summary.insights?.length ? `Insights:\n  ${payload.summary.insights.join('\n  ')}` : '',
        payload.errorDetails
          ? `Error Details:\n  Stage: ${payload.errorDetails.stage}\n  Message: ${payload.errorDetails.message}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

    case 'verbose':
      return JSON.stringify(payload, jsonReplacer, 2);

    default:
      return toPlainText({ ...payload, detailLevel: 'normal' });
  }
}
