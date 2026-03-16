import { Transaction, Subscription, SubscriptionInterval } from '@app/shared';

const SUBSCRIPTION_KEYWORDS = [
  'netflix', 'spotify', 'apple', 'google', 'microsoft', 'aws', 'azure', 'github',
  'disney', 'amazon prime', 'hulu', 'hbo', 'youtube', 'adobe', 'dropbox', 'slack',
  'zoom', 'linkedin', 'canva', 'shopify', 'wix', 'squarespace', 'mailchimp',
  'gym', 'club', 'fitness', 'insurance', 'health', 'bituach', 'cellular', 'mobile',
  'internet', 'cable', 'bezeq', 'hot', 'yes', 'partner', 'cellcom', 'extra'
];

export function detectSubscriptions(transactions: Transaction[]): Subscription[] {
  const subscriptions: Subscription[] = [];

  // 1. Group transactions by description
  const groupedByDesc = new Map<string, Transaction[]>();
  transactions.forEach(t => {
    if (t.isIgnored || t.excludeFromSubscriptions) return;

    // Exclude installments and income
    if (t.type === 'installment' || t.type === 'installments' || t.amount > 0) return;

    const desc = t.description.toLowerCase();
    if (!groupedByDesc.has(desc)) {
      groupedByDesc.set(desc, []);
    }
    groupedByDesc.get(desc)!.push(t);
  });

  // 2. Process each group
  for (const [desc, txns] of groupedByDesc.entries()) {
    // Sort transactions by date
    const sortedTxns = [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Check for manual marking
    const manualSub = sortedTxns.find(t => t.isSubscription);
    if (manualSub && manualSub.subscriptionInterval) {
      subscriptions.push({
        description: manualSub.description,
        amount: Math.abs(manualSub.amount),
        interval: manualSub.subscriptionInterval,
        nextExpectedDate: calculateNextDate(manualSub.date, manualSub.subscriptionInterval),
        category: manualSub.category,
        isManual: true,
        confidence: 1,
        history: sortedTxns
      });
      continue;
    }

    if (sortedTxns.length < 2) {
      // Check for keywords if only one transaction
      const isKeywordMatch = SUBSCRIPTION_KEYWORDS.some(word => desc.includes(word));
      if (isKeywordMatch) {
        // Default to monthly for keyword match if only 1 txn
        subscriptions.push({
          description: sortedTxns[0].description,
          amount: Math.abs(sortedTxns[0].amount),
          interval: 'monthly',
          nextExpectedDate: calculateNextDate(sortedTxns[0].date, 'monthly'),
          category: sortedTxns[0].category,
          confidence: 0.7,
          history: sortedTxns
        });
      }
      continue;
    }

    // Analyze rhythm and amount
    const analysis = analyzeRecurringPattern(sortedTxns);
    if (analysis) {
      subscriptions.push({
        ...analysis,
        history: sortedTxns
      });
    }
  }

  // 3. Filter out inactive subscriptions (longer than 2 months ago)
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  return subscriptions.filter(sub => {
    if (!sub.history || sub.history.length === 0) return true;
    const lastTxnDate = new Date(sub.history[sub.history.length - 1].date);
    return lastTxnDate >= twoMonthsAgo;
  });
}

function analyzeRecurringPattern(txns: Transaction[]): Omit<Subscription, 'history'> | null {
  if (txns.length < 2) return null;

  // Implementation of rhythm check
  const diffsInDays: number[] = [];
  for (let i = 1; i < txns.length; i++) {
    const d1 = new Date(txns[i - 1].date).getTime();
    const d2 = new Date(txns[i].date).getTime();
    diffsInDays.push(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }

  const avgInterval = diffsInDays.reduce((a, b) => a + b, 0) / diffsInDays.length;
  const avgAmount = txns.reduce((a, b) => a + Math.abs(b.amount), 0) / txns.length;

  // Variance checks
  const amountVariance = txns.every(t => Math.abs(Math.abs(t.amount) - avgAmount) / avgAmount < 0.05);

  let interval: SubscriptionInterval | null = null;
  let confidence = 0.5;

  if (avgInterval >= 27 && avgInterval <= 33) {
    interval = 'monthly';
    confidence = txns.length >= 3 ? 0.9 : 0.7;
  } else if (avgInterval >= 360 && avgInterval <= 370) {
    interval = 'annually';
    confidence = 0.9;
  } else if (avgInterval >= 6 && avgInterval <= 8) {
    interval = 'weekly';
    confidence = txns.length >= 4 ? 0.8 : 0.6;
  } else if (avgInterval >= 13 && avgInterval <= 15) {
    interval = 'bi-weekly';
    confidence = txns.length >= 3 ? 0.8 : 0.6;
  }

  if (interval && amountVariance) {
    return {
      description: txns[0].description,
      amount: avgAmount,
      interval,
      nextExpectedDate: calculateNextDate(txns[txns.length - 1].date, interval),
      category: txns[0].category,
      confidence
    };
  }

  return null;
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
