import crypto from 'crypto';
import type {
  Transaction,
  FraudDetectionLocalConfig,
  FraudDetectionLocalRulesConfig,
  FraudDetectionLocalThresholdsConfig,
  FraudFinding,
  FraudReason,
  FraudSeverity,
  FraudDetectionSummary,
} from '@app/shared';

export interface LocalFraudDetectionResult {
  summary: FraudDetectionSummary;
  findings: FraudFinding[];
}

const DEFAULT_RULES: Required<FraudDetectionLocalRulesConfig> = {
  enableOutlierAmount: true,
  enableNewMerchant: true,
  enableRapidRepeats: true,
  enableForeignCurrency: true,
};

const DEFAULT_THRESHOLDS: Required<FraudDetectionLocalThresholdsConfig> = {
  minAmountForNewMerchantIls: 250,
  foreignCurrencyMinOriginalAmount: 50,
  rapidRepeatWindowMinutes: 30,
  rapidRepeatCountThreshold: 2,
  outlierMinHistoryCount: 6,
  outlierZScore: 3.0,
  severityLowMinScore: 30,
  severityMediumMinScore: 60,
  severityHighMinScore: 80,
  notifyMinSeverity: 'medium',
  persistOnlyFlagged: true,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toIsoDateTime(d: Date) {
  return d.toISOString();
}

function parseTxnTime(txn: Transaction): number | null {
  const t = Date.parse(txn.date);
  return Number.isFinite(t) ? t : null;
}

function stableFindingId(transactionId: string, detector: 'local', version: string) {
  return crypto.createHash('sha256').update(`${transactionId}|${detector}|${version}`).digest('hex');
}

function severityFromScore(score: number, thresholds: Required<FraudDetectionLocalThresholdsConfig>): FraudSeverity {
  if (score >= thresholds.severityHighMinScore) return 'high';
  if (score >= thresholds.severityMediumMinScore) return 'medium';
  if (score >= thresholds.severityLowMinScore) return 'low';
  return 'low';
}

function buildSummary(findings: FraudFinding[]): FraudDetectionSummary {
  const flagged = findings.filter(f => f.score > 0).sort((a, b) => b.score - a.score);
  const reasonsCount = new Map<string, number>();
  for (const f of flagged) {
    for (const r of f.reasons) {
      reasonsCount.set(r.code, (reasonsCount.get(r.code) || 0) + 1);
    }
  }
  const topReasons = Array.from(reasonsCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));

  return {
    detector: 'local',
    analyzedCount: findings.length,
    flaggedCount: flagged.length,
    maxScore: flagged.length ? flagged[0].score : 0,
    topReasons,
  };
}

function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdDev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function isLikelyExpense(txn: Transaction): boolean {
  // Amount semantics can vary; in your UI you treat expenses as positive. We keep it generic:
  return typeof txn.amount === 'number' && txn.amount > 0;
}

function normalizeKey(txn: Transaction) {
  return (txn.description || '').trim().toLowerCase();
}

export class FraudDetectionService {
  detectLocal(transactions: Transaction[], history: Transaction[], cfg?: FraudDetectionLocalConfig): LocalFraudDetectionResult {
    const rules: Required<FraudDetectionLocalRulesConfig> = { ...DEFAULT_RULES, ...(cfg?.rules || {}) };
    const thresholds: Required<FraudDetectionLocalThresholdsConfig> = { ...DEFAULT_THRESHOLDS, ...(cfg?.thresholds || {}) };
    const version = cfg?.version || 'v1';

    // Index history by normalized description for quick stats
    const histByDesc = new Map<string, Transaction[]>();
    for (const h of history || []) {
      const key = normalizeKey(h);
      if (!key) continue;
      const arr = histByDesc.get(key);
      if (arr) arr.push(h);
      else histByDesc.set(key, [h]);
    }

    // Prepare rapid-repeat detection within the *current* batch
    const batchByDesc = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const key = normalizeKey(t);
      if (!key) continue;
      const arr = batchByDesc.get(key);
      if (arr) arr.push(t);
      else batchByDesc.set(key, [t]);
    }

    const nowIso = toIsoDateTime(new Date());
    const findings: FraudFinding[] = [];

    for (const txn of transactions) {
      const reasons: FraudReason[] = [];
      let score = 0;

      const key = normalizeKey(txn);
      const txnAmount = Math.abs(Number(txn.amount || 0));
      const hist = key ? (histByDesc.get(key) || []) : [];

      // 1) Foreign currency surprises
      if (rules.enableForeignCurrency) {
        const cur = (txn.originalCurrency || 'ILS').toUpperCase();
        const origAmt = Math.abs(Number(txn.originalAmount || 0));
        if (cur && cur !== 'ILS' && origAmt >= thresholds.foreignCurrencyMinOriginalAmount && isLikelyExpense(txn)) {
          const points = 20;
          score += points;
          reasons.push({
            code: 'foreign_currency',
            message: `Foreign currency charge (${cur} ${origAmt})`,
            points,
            meta: { currency: cur, originalAmount: origAmt },
          });
        }
      }

      // 2) New merchant/description (based on DB history)
      if (rules.enableNewMerchant && key) {
        const seenBefore = hist.length > 0;
        if (!seenBefore && txnAmount >= thresholds.minAmountForNewMerchantIls && isLikelyExpense(txn)) {
          const points = 25;
          score += points;
          reasons.push({
            code: 'new_merchant',
            message: `New merchant/description above threshold (₪${txnAmount})`,
            points,
            meta: { amountIls: txnAmount, threshold: thresholds.minAmountForNewMerchantIls },
          });
        }
      }

      // 3) Amount outlier vs history (z-score on absolute amounts)
      if (rules.enableOutlierAmount && key && hist.length >= thresholds.outlierMinHistoryCount && isLikelyExpense(txn)) {
        const histAmounts = hist
          .map(h => Math.abs(Number(h.amount || 0)))
          .filter(a => Number.isFinite(a) && a > 0);

        if (histAmounts.length >= thresholds.outlierMinHistoryCount) {
          const m = mean(histAmounts);
          const sd = stdDev(histAmounts);
          if (sd > 0) {
            const z = (txnAmount - m) / sd;
            if (z >= thresholds.outlierZScore) {
              const points = clamp(Math.round(15 + (z - thresholds.outlierZScore) * 10), 15, 40);
              score += points;
              reasons.push({
                code: 'amount_outlier',
                message: `Unusually high amount vs history (z=${z.toFixed(2)})`,
                points,
                meta: { zScore: z, mean: m, stdDev: sd, historyCount: histAmounts.length },
              });
            }
          }
        }
      }

      // 4) Rapid repeats in the same batch (same description) within window
      if (rules.enableRapidRepeats && key) {
        const group = batchByDesc.get(key) || [];
        if (group.length >= thresholds.rapidRepeatCountThreshold + 1) {
          const t0 = parseTxnTime(txn);
          if (t0 !== null) {
            const windowMs = thresholds.rapidRepeatWindowMinutes * 60_000;
            const similar = group.filter(other => {
              if (other.id === txn.id) return false;
              const t1 = parseTxnTime(other);
              if (t1 === null) return false;
              const within = Math.abs(t1 - t0) <= windowMs;
              const amt1 = Math.abs(Number(other.amount || 0));
              const closeAmount = txnAmount > 0 ? Math.abs(amt1 - txnAmount) / txnAmount <= 0.05 : false;
              return within && closeAmount;
            });

            if (similar.length >= thresholds.rapidRepeatCountThreshold) {
              const points = clamp(10 + similar.length * 5, 10, 30);
              score += points;
              reasons.push({
                code: 'rapid_repeats',
                message: `Multiple similar charges in ${thresholds.rapidRepeatWindowMinutes} minutes`,
                points,
                meta: { repeats: similar.length, windowMinutes: thresholds.rapidRepeatWindowMinutes },
              });
            }
          }
        }
      }

      // Clamp score and build finding
      score = clamp(score, 0, 100);
      const finding: FraudFinding = {
        id: stableFindingId(txn.id, 'local', version),
        transactionId: txn.id,
        detector: 'local',
        score,
        severity: severityFromScore(score, thresholds),
        reasons,
        createdAt: nowIso,
      };
      findings.push(finding);
    }

    // Optionally drop non-flagged before returning (useful for persistence paths)
    const persisted = thresholds.persistOnlyFlagged ? findings.filter(f => f.score > 0) : findings;
    return { summary: buildSummary(persisted), findings: persisted };
  }
}

export const fraudDetectionService = new FraudDetectionService();

