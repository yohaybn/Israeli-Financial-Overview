import { Transaction, Subscription, SubscriptionInterval, isTransactionIgnored } from '@app/shared';
import { isInternalTransfer } from './transactionUtils';

const STRONG_SUBSCRIPTION_KEYWORDS = [
  'netflix', 'spotify', 'apple music', 'apple tv', 'icloud', 'youtube premium',
  'amazon prime', 'disney', 'hulu', 'hbo', 'adobe', 'dropbox', 'canva', 'wix',
  'squarespace', 'mailchimp', 'github', 'chatgpt', 'openai'
];

const RECURRING_SERVICE_KEYWORDS = [
  'gym', 'fitness', 'insurance', 'bituach', 'cellular', 'mobile', 'internet',
  'bezeq', 'hot', 'yes', 'partner', 'cellcom', 'pelephone', 'pelphone'
];

export function detectSubscriptions(transactions: Transaction[]): Subscription[] {
  const subscriptions: Subscription[] = [];

  // 1. Group transactions by a normalized merchant key.
  const groupedByDesc = new Map<string, Transaction[]>();
  transactions.forEach(t => {
    if (isTransactionIgnored(t) || t.excludeFromSubscriptions) return;

    // Exclude installments, income, and internal transfers.
    if (t.type === 'installment' || t.type === 'installments' || t.amount > 0) return;
    if (isInternalTransfer(t)) return;

    const merchantKey = normalizeMerchantKey(t.description);
    if (!merchantKey) return;

    if (!groupedByDesc.has(merchantKey)) {
      groupedByDesc.set(merchantKey, []);
    }
    groupedByDesc.get(merchantKey)!.push(t);
  });

  // 2. Process each group
  for (const [, txns] of groupedByDesc.entries()) {
    // Sort transactions by date
    const sortedTxns = [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const latestTxn = sortedTxns[sortedTxns.length - 1];
    const representativeDescription = pickRepresentativeDescription(sortedTxns);

    // Check for manual marking
    const manualSub = [...sortedTxns].reverse().find(t => t.isSubscription);
    if (manualSub) {
      const manualInterval = manualSub.subscriptionInterval || 'monthly';
      subscriptions.push({
        description: representativeDescription,
        amount: Math.abs(latestTxn.amount),
        interval: manualInterval,
        nextExpectedDate: calculateNextDate(latestTxn.date, manualInterval),
        category: latestTxn.category,
        isManual: true,
        confidence: 1,
        history: sortedTxns
      });
      continue;
    }

    if (sortedTxns.length < 2) {
      // Conservative fallback: only strong-brand keywords can trigger a single-transaction subscription.
      const normalizedDesc = normalizeMerchantKey(latestTxn.description);
      const isStrongKeywordMatch = STRONG_SUBSCRIPTION_KEYWORDS.some(word => normalizedDesc.includes(word));
      if (isStrongKeywordMatch && isActiveByInterval(latestTxn.date, 'monthly')) {
        subscriptions.push({
          description: representativeDescription,
          amount: Math.abs(latestTxn.amount),
          interval: 'monthly',
          nextExpectedDate: calculateNextDate(latestTxn.date, 'monthly'),
          category: latestTxn.category,
          confidence: 0.65,
          history: sortedTxns
        });
      }
      continue;
    }

    // Analyze rhythm and amount
    const analysis = analyzeRecurringPattern(sortedTxns, representativeDescription);
    if (analysis) {
      subscriptions.push({
        ...analysis,
        history: sortedTxns
      });
    }
  }

  // 3. Filter out inactive subscriptions using interval-aware windows.
  return subscriptions.filter(sub => {
    if (!sub.history || sub.history.length === 0) return true;
    const lastTxnDate = sub.history[sub.history.length - 1].date;
    return isActiveByInterval(lastTxnDate, sub.interval);
  });
}

function analyzeRecurringPattern(
  txns: Transaction[],
  description: string
): Omit<Subscription, 'history'> | null {
  if (txns.length < 2) return null;

  const diffsInDays: number[] = [];
  for (let i = 1; i < txns.length; i++) {
    const d1 = new Date(txns[i - 1].date).getTime();
    const d2 = new Date(txns[i].date).getTime();
    diffsInDays.push(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }

  const amounts = txns.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
  const medianAmount = amounts[Math.floor(amounts.length / 2)] || 0;
  if (medianAmount <= 0) return null;

  // Allow moderate amount drift (pricing/tax deltas) with both relative and absolute tolerances.
  const amountStable = txns.every(t => {
    const current = Math.abs(t.amount);
    const relativeDelta = Math.abs(current - medianAmount) / medianAmount;
    const absoluteDelta = Math.abs(current - medianAmount);
    return relativeDelta <= 0.12 || absoluteDelta <= 12;
  });
  if (!amountStable) return null;

  const bestInterval = detectBestInterval(diffsInDays);
  if (!bestInterval) return null;

  const keywordHint = hasRecurringKeyword(description) ? 0.05 : 0;
  const confidence = Math.min(
    0.98,
    bestInterval.matchRatio * 0.7 + Math.min(txns.length, 6) * 0.05 + keywordHint
  );

  // Require stronger evidence for non-branded recurring services.
  if (txns.length < 3 && confidence < 0.8) return null;

  return {
    description,
    amount: medianAmount,
    interval: bestInterval.interval,
    nextExpectedDate: calculateNextDate(txns[txns.length - 1].date, bestInterval.interval),
    category: txns[txns.length - 1].category,
    confidence
  };
}

function detectBestInterval(
  diffsInDays: number[]
): { interval: SubscriptionInterval; matchRatio: number } | null {
  if (diffsInDays.length === 0) return null;

  const intervalMatchers: Array<{
    interval: SubscriptionInterval;
    matches: (diff: number) => boolean;
  }> = [
    { interval: 'daily', matches: d => d >= 1 && d <= 2 },
    { interval: 'weekly', matches: d => Math.abs(d - 7) <= 1 },
    { interval: 'bi-weekly', matches: d => Math.abs(d - 14) <= 2 },
    {
      interval: 'monthly',
      matches: d => {
        const cycles = Math.round(d / 30);
        if (cycles < 1 || cycles > 3) return false;
        return Math.abs(d - cycles * 30) <= 4 * cycles;
      }
    },
    { interval: 'annually', matches: d => Math.abs(d - 365) <= 10 }
  ];

  let best: { interval: SubscriptionInterval; matchRatio: number } | null = null;
  for (const matcher of intervalMatchers) {
    const matches = diffsInDays.filter(d => matcher.matches(d)).length;
    const ratio = matches / diffsInDays.length;
    if (!best || ratio > best.matchRatio) {
      best = { interval: matcher.interval, matchRatio: ratio };
    }
  }

  if (!best) return null;
  if (best.matchRatio < 0.7) return null;
  return best;
}

function normalizeMerchantKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2 && !/^\d+$/.test(token))
    .join(' ')
    .trim();
}

function pickRepresentativeDescription(txns: Transaction[]): string {
  const counts = new Map<string, number>();
  txns.forEach(txn => {
    const key = txn.description.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let winner = txns[txns.length - 1]?.description || '';
  let best = -1;
  counts.forEach((count, desc) => {
    if (count > best) {
      best = count;
      winner = desc;
    }
  });
  return winner;
}

function hasRecurringKeyword(description: string): boolean {
  const normalized = normalizeMerchantKey(description);
  return (
    STRONG_SUBSCRIPTION_KEYWORDS.some(word => normalized.includes(word)) ||
    RECURRING_SERVICE_KEYWORDS.some(word => normalized.includes(word))
  );
}

function isActiveByInterval(lastDate: string, interval: SubscriptionInterval): boolean {
  const date = new Date(lastDate);
  const now = new Date();
  const graceDaysByInterval: Record<SubscriptionInterval, number> = {
    daily: 3,
    weekly: 21,
    'bi-weekly': 35,
    monthly: 75,
    annually: 430
  };
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= graceDaysByInterval[interval];
}

function calculateNextDate(lastDate: string, interval: SubscriptionInterval): string {
  const date = new Date(lastDate);
  switch (interval) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'bi-weekly': date.setDate(date.getDate() + 14); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'annually': date.setFullYear(date.getFullYear() + 1); break;
  }
  return date.toISOString().split('T')[0];
}
