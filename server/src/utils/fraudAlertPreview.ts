import type { FraudDetectionSummary, FraudFinding, FraudSeverity, Transaction } from '@app/shared';

function fraudSeverityRank(sev: FraudSeverity): number {
  return sev === 'high' ? 3 : sev === 'medium' ? 2 : 1;
}

export function buildLocalFraudAlertPreview(
  findings: FraudFinding[],
  transactions: Transaction[],
  summary: FraudDetectionSummary,
  notifyMinSeverity: FraudSeverity | undefined
): { wouldNotify: boolean; insightLine: string; itemLines: string[] } {
  const notifyMin = notifyMinSeverity || 'medium';
  const wouldNotify = findings.some(
    (f) => fraudSeverityRank(f.severity) >= fraudSeverityRank(notifyMin)
  );
  const insightLine = `Local fraud detection flagged ${summary.flaggedCount} transactions (max score ${summary.maxScore}).`;
  const top = [...findings].sort((a, b) => b.score - a.score).slice(0, 5);
  const itemLines = top.map((f) => {
    const txn = transactions.find((t) => t.id === f.transactionId);
    const desc = txn?.description || 'Unknown';
    const amount = txn?.amount ?? 0;
    const reason = f.reasons[0]?.message || 'Suspicious pattern';
    return `• ${desc} (₪${amount}, score ${f.score}) - ${reason}`;
  });
  return { wouldNotify, insightLine, itemLines };
}
